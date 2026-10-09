import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createFirebaseVerifier } from '../firebase-auth.mjs';
import { createD1Quota, LIMITS } from '../d1-quota.mjs';
import { createHandler, createWorkerDependencies } from '../index.mjs';
import { sqliteBinding } from './sqlite-binding.mjs';

const stamp = 1_791_540_000_000;
const projectId = 'demo-myelin-assistant'; const apiKey = 'test-key-not-a-real-credential';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const claims = { aud: projectId, iss: `https://securetoken.google.com/${projectId}`, sub: 'owner',
  iat: stamp/1000-10, exp: stamp/1000+3600, auth_time: stamp/1000-100,
  email: 'test@example.invalid', email_verified: true, firebase: { sign_in_provider: 'password' } };
// These are fake tokens. Google's signature validation is simulated, not proven.
const tokenFor = patch => encode({ alg: 'RS256', kid: 'synthetic' })+'.'+encode({ ...claims, ...patch })+'.fakeSignature';
const user = { localId: 'owner', validSince: String(stamp/1000-200), emailVerified: true, email: claims.email };
const fixture = (response = { users: [user] }, status = 200, clock = () => stamp) => {
  let calls = 0;
  const verify = createFirebaseVerifier({ projectId, apiKey, now: clock, async fetch(url, init) {
    calls++; assert.equal(url, `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`);
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.equal(Object.keys(JSON.parse(init.body)).join(','), 'idToken'); assert.ok(init.signal);
    return new Response(JSON.stringify(response), { status });
  } });
  return { verify, calls: () => calls };
};

test('Firebase lookup is mandatory on every valid request, including repeated tokens', async () => {
  const f = fixture();
  for (let index=0; index<2; index++) assert.deepEqual(await f.verify(tokenFor()),
    { uid: 'owner', email_verified: true, firebase: { sign_in_provider: 'password' } });
  assert.equal(f.calls(), 2);
  for (const patch of [{ aud: 'other-project' }, { iss: 'other' }, { exp: stamp/1000 },
    { iat: stamp/1000+1 }, { auth_time: stamp/1000+1 }, { sub: '' }, { firebase: { sign_in_provider: 'password', tenant: 'other' } }])
    await assert.rejects(f.verify(tokenFor(patch)), { code: 'auth/invalid-id-token' });
  await assert.rejects(f.verify(encode({ alg: 'none' })+'.'+encode(claims)+'.signature'), { code: 'auth/invalid-id-token' });
  assert.equal(f.calls(), 2);
});

test('revocation compares original auth_time, even on freshly refreshed signed tokens', async () => {
  const f = fixture({ users: [{ ...user, validSince: String(claims.auth_time+1) }] });
  await assert.rejects(f.verify(tokenFor({ iat: stamp/1000 })), { code: 'auth/id-token-revoked' });
  const boundary = fixture({ users: [{ ...user, validSince: String(claims.auth_time) }] });
  assert.equal((await boundary.verify(tokenFor())).uid, 'owner');
  await assert.rejects(fixture({ users: [{ ...user, disabled: true }] }).verify(tokenFor()), { code: 'auth/user-disabled' });
});

test('invalid/tampered credentials versus auth outages are distinct and fail closed', async () => {
  for (const message of ['INVALID_ID_TOKEN', 'TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND'])
    await assert.rejects(fixture({ error: { message } }, 400).verify(tokenFor()), { code: 'auth/invalid-id-token' });
  for (const [reply, status] of [[{ error: { message: 'API_KEY_INVALID' } }, 400], [{ error: { message: 'QUOTA_EXCEEDED' } }, 429],
    [{ users: [] }, 200], [{ users: [user, user] }, 200], [{ users: [{ ...user, localId: 'other' }] }, 200],
    [{ users: [{ ...user, validSince: undefined }] }, 200], [{ users: [{ ...user, validSince: 'NaN' }] }, 200],
    [{ users: [{ ...user, disabled: 'false' }] }, 200]])
    await assert.rejects(fixture(reply, status).verify(tokenFor()), { code: 'auth/service-unavailable' });
  let clock = stamp;
  const f = fixture({ users: [user] }, 200, () => { const result=clock; clock+=4_000_000; return result; });
  await assert.rejects(f.verify(tokenFor()), { code: 'auth/invalid-id-token' });
});

test('current and token verification must agree; account-state changes are never cached', async () => {
  assert.equal((await fixture({ users: [{ ...user, emailVerified: false }] }).verify(tokenFor())).email_verified, false);
  assert.equal((await fixture().verify(tokenFor({ email_verified: false }))).email_verified, false);
  assert.equal((await fixture().verify(tokenFor({ email: 'other@example.invalid' }))).email_verified, false);
  assert.equal((await fixture().verify(tokenFor({ firebase: { sign_in_provider: 'anonymous' } }))).firebase.sign_in_provider, 'anonymous');
  let disabled = false;
  const verify = createFirebaseVerifier({ projectId, apiKey, now: () => stamp,
    fetch: async () => new Response(JSON.stringify({ users: [{ ...user, disabled }] })) });
  await verify(tokenFor()); disabled = true;
  await assert.rejects(verify(tokenFor()), { code: 'auth/user-disabled' });
});

test('auth HTTP body size, malformed JSON, network failure and cancellation reject', async () => {
  for (const fetch of [async()=>new Response('x'.repeat(64_001)), async()=>new Response('{'),
    async()=>{ throw new Error('private diagnostics'); }]) {
    const verify = createFirebaseVerifier({ projectId, apiKey, now:()=>stamp, fetch });
    await assert.rejects(verify(tokenFor()), { code: 'auth/service-unavailable' });
  }
  const controller = new AbortController();
  const verify = createFirebaseVerifier({ projectId, apiKey, now:()=>stamp,
    fetch: async()=>new Promise(()=>{}) });
  const pending=verify(tokenFor(), controller.signal); controller.abort();
  await assert.rejects(pending, { code: 'auth/service-unavailable' });
});

test('actual SQL charges attempts on release, rejects duplicate and recovers expired leases', async () => {
  const f=sqliteBinding(); let now=stamp; const quota=createD1Quota(f.db,{now:()=>now});
  try {
    const release=await quota.reserve('owner','first');
    await assert.rejects(quota.reserve('owner','second'), { code: 'request-in-progress' });
    await release(); await release();
    await assert.rejects(quota.reserve('owner','first'), { code: 'duplicate-request' });
    const next=await quota.reserve('owner','second');
    now+=90_001; const third=await quota.reserve('owner','third');
    await next(); // old lease cannot release another reservation
    await assert.rejects(quota.reserve('owner','fourth'), { code: 'request-in-progress' });
    await third();
    const rows=f.sqlite.prepare('SELECT * FROM assistant_attempts').all();
    assert.equal(rows.length,3); assert.equal(rows.every(row=>row.active_until===0),true);
    assert.equal(JSON.stringify(rows).includes('owner'),false); assert.equal(JSON.stringify(rows).includes('first'),false);
  } finally { f.close(); }
});

test('SQL user/shared minute/day windows reset at UTC boundaries and attempts remain counted', async () => {
  const f=sqliteBinding(); let now=Math.floor(stamp/86_400_000)*86_400_000; const quota=createD1Quota(f.db,{now:()=>now});
  try {
    for(let i=0;i<LIMITS.userMinute;i++) await (await quota.reserve('owner','minute-'+i))();
    await assert.rejects(quota.reserve('owner','excess'),{code:'minute-limit'});
    for(let i=LIMITS.userMinute;i<LIMITS.userDay;i++) {now+=60_000; await(await quota.reserve('owner','day-'+i))();}
    await assert.rejects(quota.reserve('owner','day-excess'),{code:'daily-limit'});
    for(let i=LIMITS.userDay;i<LIMITS.sharedDay;i++) {now+=60_000; await(await quota.reserve('user-'+i,'day'))();}
    await assert.rejects(quota.reserve('new-user','shared-excess'),{code:'daily-limit'});
    now=(Math.floor(now/86_400_000)+1)*86_400_000;
    await(await quota.reserve('owner','next-day'))();
    // Retention ends after seven days; fenced old cleanup cannot release a new lease.
    const old=await quota.reserve('fenced','same-id');
    now+=7*86_400_000+1; const current=await quota.reserve('fenced','same-id'); await old();
    await assert.rejects(quota.reserve('fenced','other-id'),{code:'request-in-progress'}); await current();
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM assistant_attempts').get().n,1);
  } finally {f.close();}
});

test('provider cooldown is shared, monotonic and independent of lease cleanup', async()=>{
  const f=sqliteBinding(); let now=stamp; const a=createD1Quota(f.db,{now:()=>now}); const b=createD1Quota(f.db,{now:()=>now});
  try {
    await a.cooldown(100); await b.cooldown(10);
    await assert.rejects(b.reserve('other','x'),{code:'provider-busy',retryAfter:100});
    now+=100_000; await(await b.reserve('other','x'))();
    f.sqlite.exec('DELETE FROM assistant_control');
    await assert.rejects(a.reserve('owner','x'),{code:'quota-unavailable'});
    await assert.rejects(a.cooldown(60),{code:'quota-unavailable'});
  } finally {f.close();}
});

test('broken D1 and ambiguous reservation never authorize AI; SQL transaction failures roll back',async()=>{
  const f=sqliteBinding(); const quota=createD1Quota(f.db,{now:()=>stamp}); const original=f.db.batch;
  try {
    f.db.batch=async statements=>original([...statements,f.db.prepare('SELECT missing_column').bind()]);
    await assert.rejects(quota.reserve('owner','x'),{code:'quota-unavailable'});
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM assistant_attempts').get().n,0);
    f.db.batch=async statements=>{await original(statements); throw new Error('lost response');};
    await assert.rejects(quota.reserve('owner','x'),{code:'quota-unavailable'});
    f.db.batch=original;
    await assert.rejects(quota.reserve('owner','x'),{code:'duplicate-request'});
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM assistant_attempts').get().n,1);
  }finally{f.close();}
});

async function concurrent(path, sameUser, sameId, now = stamp) {
  const gate=new SharedArrayBuffer(4); const lock=new Int32Array(gate);
  const workers=Array.from({length:12},(_,index)=>new Worker(new URL('./quota-thread.mjs',import.meta.url),
    {workerData:{path,index,gate,sameUser,sameId,now}}));
  const ready=workers.map(worker=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);}));
  await Promise.all(ready);
  const results=workers.map(worker=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);}));
  Atomics.store(lock,0,1); Atomics.notify(lock,0);
  const replies=await Promise.all(results); await Promise.all(workers.map(worker=>worker.terminate())); return replies;
}
test('12 independent SQLite connections concurrently enforce shared limits and request deduplication',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'myelin-d1-'));
  try {
    for(const duplicate of [false,true]) {
      const path=join(dir,duplicate?'duplicate.sqlite':'limits.sqlite'); const f=sqliteBinding(path);
      const replies=await concurrent(path,duplicate,duplicate);
      const accepted=replies.filter(reply=>reply==='accepted').length;
      const count=f.sqlite.prepare('SELECT count(*) AS n FROM assistant_attempts').get().n;
      assert.equal(accepted,count); assert.ok(accepted>0);
      if(duplicate) {assert.equal(accepted,1);assert.ok(replies.every(reply=>['accepted','duplicate-request'].includes(reply)));}
      else {assert.ok(accepted<=LIMITS.sharedMinute); assert.ok(replies.every(reply=>['accepted','minute-limit','request-in-progress'].includes(reply)));}
      f.close();
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('concurrent reservations cannot exceed the last user or shared daily slot',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'myelin-d1-daily-'));
  try {
    for(const userLimit of [false,true]) {
      const path=join(dir,userLimit?'user.sqlite':'shared.sqlite'); const f=sqliteBinding(path);
      let now=Math.floor(stamp/86_400_000)*86_400_000;
      const quota=createD1Quota(f.db,{now:()=>now}); const cap=userLimit?LIMITS.userDay:LIMITS.sharedDay;
      for(let index=0;index<cap-1;index++) {
        now+=60_000;
        await(await quota.reserve(userLimit?'shared-owner':'seed-'+index,'seed-'+index))();
      }
      now+=60_000;
      const replies=await concurrent(path,userLimit,false,now);
      assert.equal(replies.filter(reply=>reply==='accepted').length,1);
      assert.ok(replies.every(reply=>['accepted','daily-limit'].includes(reply)));
      assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM assistant_attempts').get().n,cap);
      f.close();
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('shared active leases and delayed expired responses fail closed without refunding attempts',async()=>{
  const f=sqliteBinding(); let now=stamp; const quota=createD1Quota(f.db,{now:()=>now});
  try{
    const first=await quota.reserve('first','x'); const second=await quota.reserve('second','x');
    await assert.rejects(quota.reserve('third','x'),{code:'request-in-progress'});
    now+=90_001; const third=await quota.reserve('third','x'); await first(); await second(); await third();
    const original=f.db.batch;
    f.db.batch=async statements=>{const result=await original(statements);now+=90_001;return result;};
    await assert.rejects(quota.reserve('delayed','x'),{code:'quota-unavailable'});
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM assistant_attempts').get().n,4);
  }finally{f.close();}
});

test('production SQL clock and dependencies work without request/env auth overrides',async()=>{
  const f=sqliteBinding(); const quota=createD1Quota(f.db);
  try{
    await(await quota.reserve('production-clock','x'))();
    assert.deepEqual(createWorkerDependencies({AI:{run(){}},VERIFY_TOKEN:()=>claims,QUOTA:quota}),{});
    const deps=createWorkerDependencies({AI:{run(){}},ASSISTANT_DB:f.db,FIREBASE_PROJECT_ID:projectId,FIREBASE_WEB_API_KEY:apiKey});
    assert.equal(typeof deps.verifyToken,'function'); assert.equal(typeof deps.quota.reserve,'function');
  }finally{f.close();}
});

test('real verifier + actual SQL + handler blocks revoked, unverified, anonymous and duplicates before model',async()=>{
  const f=sqliteBinding(); let calls=0; let account={...user};
  const verifyToken=createFirebaseVerifier({projectId,apiKey,now:()=>stamp,fetch:async()=>new Response(JSON.stringify({users:[account]}))});
  const handler=createHandler({verifyToken,quota:createD1Quota(f.db,{now:()=>stamp}),ai:{async run(){calls++;return{};}}});
  const req=patch=>new Request('https://example.invalid/assistant',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+tokenFor(patch)},
    body:JSON.stringify({version:1,prompt:JSON.stringify({requestId:'integration',userRequest:'Explain this request',context:{}})})});
  try{
    account.validSince=String(claims.auth_time+1);assert.equal((await handler(req())).status,401);
    account={...user,emailVerified:false};assert.equal((await handler(req())).status,403);
    account={...user};assert.equal((await handler(req({firebase:{sign_in_provider:'anonymous'}}))).status,403);
    assert.equal(calls,0);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM assistant_attempts').get().n,0);
    assert.equal((await handler(req())).status,502);assert.equal(calls,1); // invalid provider output counts
    assert.equal((await handler(req())).status,409);assert.equal(calls,1);
  }finally{f.close();}
});
