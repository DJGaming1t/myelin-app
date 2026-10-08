const { createHash, randomUUID } = require('node:crypto');

class CloudError extends Error {
  constructor(status, code, retryAfter = 0) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

// Fixed windows are conservative application limits, not provider quota claims.
const LIMITS = Object.freeze({ userMinute: 2, userDay: 20, globalMinute: 6, globalDay: 120 });
const minute = 60_000;
const day = 86_400_000;
function nextQuota(global = {}, user = {}, requestId, now, leaseId) {
  if (global.cooldownUntil > now) throw new CloudError(429, 'provider-busy', Math.ceil((global.cooldownUntil - now) / 1000));
  if (user.activeUntil > now) throw new CloudError(429, 'request-in-progress', Math.ceil((user.activeUntil - now) / 1000));
  const recent = (user.recent ?? []).filter(item => item.at > now - 600_000);
  if (recent.some(item => item.id === requestId)) throw new CloudError(409, 'duplicate-request');
  const update = (previous, perMinute, perDay) => {
    const minuteKey = Math.floor(now / minute);
    const dayKey = Math.floor(now / day);
    const minuteCount = previous.minuteKey === minuteKey ? previous.minuteCount : 0;
    const dayCount = previous.dayKey === dayKey ? previous.dayCount : 0;
    if (dayCount >= perDay) throw new CloudError(429, 'daily-limit', Math.ceil(((dayKey + 1) * day - now) / 1000));
    if (minuteCount >= perMinute) throw new CloudError(429, 'minute-limit', Math.ceil(((minuteKey + 1) * minute - now) / 1000));
    return { minuteKey, minuteCount: minuteCount + 1, dayKey, dayCount: dayCount + 1 };
  };
  return {
    global: { ...update(global, LIMITS.globalMinute, LIMITS.globalDay), cooldownUntil: global.cooldownUntil ?? 0 },
    user: { ...update(user, LIMITS.userMinute, LIMITS.userDay), leaseId, activeUntil: now + 45_000,
      recent: [...recent, { id: requestId, at: now }].slice(-LIMITS.userDay) },
  };
}

function createFirestoreQuota(db, now = Date.now) {
  const globalRef = db.doc('_assistantQuota/global');
  return {
    async reserve(uid, requestId) {
      // Auth UIDs may contain slash; hashing makes a single deterministic document.
      const userRef = db.doc('_assistantQuota/user-' + createHash('sha256').update(uid).digest('hex'));
      const leaseId = randomUUID();
      await db.runTransaction(async tx => {
        const [global, user] = await Promise.all([tx.get(globalRef), tx.get(userRef)]);
        const next = nextQuota(global.data(), user.data(), requestId, now(), leaseId);
        tx.set(globalRef, next.global);
        tx.set(userRef, next.user);
      });
      return async () => db.runTransaction(async tx => {
        const user = (await tx.get(userRef)).data();
        if (user?.leaseId === leaseId) tx.update(userRef, { activeUntil: 0, leaseId: '' });
      });
    },
    async cooldown(seconds) {
      await db.runTransaction(async tx => {
        const previous = (await tx.get(globalRef)).data() ?? {};
        tx.set(globalRef, { ...previous, cooldownUntil: Math.max(previous.cooldownUntil ?? 0, now() + seconds * 1000) });
      });
    },
  };
}
module.exports = { CloudError, LIMITS, nextQuota, createFirestoreQuota };
