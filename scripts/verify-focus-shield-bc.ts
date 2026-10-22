import assert from 'node:assert/strict';
import { addCustomScheduleWindow, defaultFocusShieldConfig, validateFocusShieldConfig, applyFocusShieldProfile, matchesBlockedDomain, normalizeWebsiteDomain, computeFrictionRequirement, buildHistoricalTemptationAnalytics, createFocusShieldStorage, isScheduleActiveAt } from '../src/features/focus/focus-shield';

async function verify() {
  const now = Date.now();
  const initial = defaultFocusShieldConfig();
  assert.equal(initial.websiteBlockingEnabled, false, 'Website VPN is opt-in for new configurations.');
  let config = applyFocusShieldProfile({...initial, websiteBlockingEnabled: true}, 'exam');
  for (const host of ['youtu.be', 'r1.googlevideo.com', 'i.redd.it']) assert.ok(matchesBlockedDomain(host, config));
  for (const host of ['notyoutube.com', 'youtube.com.evil.test']) assert.equal(matchesBlockedDomain(host, config), null);
  for (const host of ['127.0.0.1', 'bad-.example', '-bad.example', 'a'.repeat(64)+'.example']) assert.equal(normalizeWebsiteDomain(host), null);
  config = {...config, schedules: [], sessionOnly: false};
  assert.deepEqual(validateFocusShieldConfig(config).schedules, [], 'Deleting all schedules must not restore presets.');
  const outcome = addCustomScheduleWindow(config, {label:'Night',days:[2],startMinuteOfDay:22*60,endMinuteOfDay:6*60});
  assert.equal(outcome.added,true); config=outcome.config;
  assert.equal(isScheduleActiveAt(config,new Date(2026,9,20,23).getTime()),true);
  assert.equal(isScheduleActiveAt(config,new Date(2026,9,21,5,59).getTime()),true);
  assert.equal(isScheduleActiveAt(config,new Date(2026,9,21,6).getTime()),false);
  config={...config,mode:'hard',unlockDelaySeconds:10};
  assert.deepEqual([1,2,3,4,20].map(attemptCount=>computeFrictionRequirement({config,attemptCount,breakPassesUsed:0,lastAttemptAt:null}).effectiveDelaySeconds),[10,15,23,34,120]);
  const entries:any[]=[{id:'a',timestamp:now-1000,vector:'blocked-app',outcome:'returned'}, {id:'b',timestamp:now-500,vector:'blocked-website',outcome:'blocked'}, {id:'future',timestamp:now+1000,vector:'blocked-app',outcome:'returned'}, {id:'old',timestamp:now-8*86400000,vector:'blocked-app',outcome:'returned'}];
  const report=buildHistoricalTemptationAnalytics(entries,now);assert.equal(report.totalAttempts,2);assert.equal(report.recoveryRatePercent,50);
  const values=new Map<string,string>();const storage=createFocusShieldStorage({getItem:async k=>values.get(k)??null,setItem:async(k,v)=>{values.set(k,v);},removeItem:async k=>{values.delete(k);}});
  await Promise.all(Array.from({length:10},(_,i)=>storage.appendAttempt('A',{timestamp:now-i,vector:'blocked-website',outcome:'blocked',awaySeconds:0})));
  assert.equal((await storage.loadAttempts('A')).length,10,'Concurrent events must not overwrite each other.');
  assert.equal((await storage.loadAttempts('B')).length,0);
  console.log('✓ Focus Shield B+C: companion domains, suffix safety, invalid domains, schedule deletion/overnight boundaries, friction cap, honest recovery analytics and concurrent owner-scoped log writes');
}
void verify().catch(e=>{console.error(e);process.exitCode=1;});
