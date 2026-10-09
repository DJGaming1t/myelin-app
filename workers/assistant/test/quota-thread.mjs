import { workerData, parentPort } from 'node:worker_threads';
import { sqliteBinding } from './sqlite-binding.mjs';
import { createD1Quota } from '../d1-quota.mjs';
const {path,index,gate,sameUser,sameId,now}=workerData;
const binding=sqliteBinding(path,false); const quota=createD1Quota(binding.db,{now:()=>now});
parentPort.postMessage('ready'); Atomics.wait(new Int32Array(gate),0,0);
try {
  const release=await quota.reserve(sameUser?'shared-owner':'owner-'+index,sameId?'same-request':'request-'+index);
  await release(); parentPort.postMessage('accepted');
} catch(error) {parentPort.postMessage(error.code??'unexpected-error');}
finally {binding.close();}
