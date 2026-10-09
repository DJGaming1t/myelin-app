import { CloudError } from './errors.mjs';

// Conservative application caps, NOT a certified neurons/day allocation.
// Budget/latency must be measured before any deployment or cap increase.
export const LIMITS = Object.freeze({ userMinute: 2, userDay: 8, sharedMinute: 4, sharedDay: 24, sharedActive: 2 });
const day = 86_400_000;
const leaseMs = 90_000;
const retentionMs = 7 * day;
const encoder = new TextEncoder();
const unavailable = () => new CloudError(503, 'quota-unavailable');

async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))),
    byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createD1Quota(db, { now } = {}) {
  if (typeof db?.prepare !== 'function' || typeof db?.batch !== 'function') throw unavailable();
  // Production uses database time at transaction execution, not stale HTTP time.
  // An injected clock is only for trusted server tests, never an env/body option.
  const clock = now ? 'SELECT CAST(? AS INTEGER) AS now' : "SELECT unixepoch('now') * 1000 AS now";
  const bind = (sql, args = [], time) => db.prepare(sql).bind(...(now ? [time, ...args] : args));
  return {
    async reserve(uid, requestId) {
      if (typeof uid !== 'string' || !uid || uid.length > 128 ||
          typeof requestId !== 'string' || !requestId || requestId.length > 120) throw unavailable();
      const [user, request] = await Promise.all([hash(uid), hash(requestId)]);
      const lease = crypto.randomUUID(); const time = now?.();
      // The insert is the authorization decision. All predicates execute inside
      // this write transaction; no read-then-write race or replica read grants AI.
      const predicates = `WITH clock AS (${clock}), checks AS (
        SELECT now,
          (SELECT cooldown_until FROM assistant_control WHERE singleton=1) AS cooldown,
          EXISTS(SELECT 1 FROM assistant_attempts WHERE user_key=? AND request_key=?) AS duplicate,
          EXISTS(SELECT 1 FROM assistant_attempts WHERE user_key=? AND active_until>now) AS user_active,
          (SELECT count(*) FROM assistant_attempts WHERE active_until>now) AS shared_active,
          (SELECT count(*) FROM assistant_attempts WHERE user_key=? AND started_at >= (now / 60000)*60000) AS user_minute,
          (SELECT count(*) FROM assistant_attempts WHERE user_key=? AND started_at >= (now / ${day})*${day}) AS user_day,
          (SELECT count(*) FROM assistant_attempts WHERE started_at >= (now / 60000)*60000) AS shared_minute,
          (SELECT count(*) FROM assistant_attempts WHERE started_at >= (now / ${day})*${day}) AS shared_day
        FROM clock)
        `;
      const checkArgs = [user, request, user, user, user];
      try {
        const result = await db.batch([
          bind(`WITH clock AS (${clock}) DELETE FROM assistant_attempts
            WHERE started_at < (SELECT now-${retentionMs} FROM clock)`, [], time),
          bind(`${predicates} INSERT INTO assistant_attempts(user_key,request_key,lease_id,started_at,active_until)
            SELECT ?,?,?,now,now+${leaseMs} FROM checks
            WHERE cooldown <= now AND duplicate=0 AND user_active=0
              AND shared_active < ${LIMITS.sharedActive} AND user_minute < ${LIMITS.userMinute}
              AND user_day < ${LIMITS.userDay} AND shared_minute < ${LIMITS.sharedMinute} AND shared_day < ${LIMITS.sharedDay}
            RETURNING lease_id, active_until`, [...checkArgs, user, request, lease], time),
          bind(`${predicates} SELECT *,
            (SELECT min(active_until) FROM assistant_attempts WHERE active_until>now) AS earliest_release
            FROM checks`, checkArgs, time),
        ]);
        if (!Array.isArray(result) || result.length !== 3 || result.some(item => item.success !== true)) throw unavailable();
        const receipt = result[1].results;
        if (receipt?.length === 1 && receipt[0].lease_id === lease) {
          if (!Number.isSafeInteger(receipt[0].active_until)) throw unavailable();
          // A delayed/ambiguous database response never authorizes a stale lease.
          if ((now ? now() : Date.now()) >= receipt[0].active_until) throw unavailable();
          return async () => {
            try {
              const released = await db.prepare(`UPDATE assistant_attempts SET active_until=0
                WHERE user_key=? AND request_key=? AND lease_id=?`).bind(user, request, lease).run();
              if (released?.success !== true) throw unavailable();
            } catch { throw unavailable(); }
          };
        }
        if (receipt?.length !== 0 || result[2].results?.length !== 1) throw unavailable();
        const check = result[2].results[0];
        if (!Number.isSafeInteger(check.now) || !Number.isSafeInteger(check.cooldown)) throw unavailable();
        if (check.cooldown > check.now) throw new CloudError(429, 'provider-busy', Math.ceil((check.cooldown-check.now)/1000));
        if (check.duplicate) throw new CloudError(409, 'duplicate-request');
        if (check.user_active || check.shared_active >= LIMITS.sharedActive)
          throw new CloudError(429, 'request-in-progress', Math.max(1, Math.ceil((check.earliest_release-check.now)/1000)));
        if (check.user_day >= LIMITS.userDay || check.shared_day >= LIMITS.sharedDay)
          throw new CloudError(429, 'daily-limit', Math.ceil(((Math.floor(check.now/day)+1)*day-check.now)/1000));
        if (check.user_minute >= LIMITS.userMinute || check.shared_minute >= LIMITS.sharedMinute)
          throw new CloudError(429, 'minute-limit', Math.ceil(((Math.floor(check.now/60000)+1)*60000-check.now)/1000));
        throw unavailable();
      } catch (error) { if (error instanceof CloudError) throw error; throw unavailable(); }
    },
    async cooldown(seconds) {
      if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86_400) throw unavailable();
      try {
        const time = now?.();
        const result = await bind(`WITH clock AS (${clock}) UPDATE assistant_control
          SET cooldown_until=max(cooldown_until,(SELECT now FROM clock)+?) WHERE singleton=1
          RETURNING singleton`, [seconds*1000], time).all();
        if (result?.success !== true || result.results?.length !== 1) throw unavailable();
      } catch { throw unavailable(); }
    },
  };
}
