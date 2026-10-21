import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import worker,{validDaily} from '../worker/health-ingest.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const saved=new Map();
const env={HEALTH_INGEST_TOKEN:'A'.repeat(43),RECEIPT_IMAGES:{async put(k,v){saved.set(k,JSON.parse(v))}}};
const daily={kind:'daily',metric:'steps',value:29,unit:'count',date:new Date().toISOString().slice(0,10),observedAt:new Date().toISOString(),sourceMethod:'single-source',sourceLabel:'Mathias klocka'};
async function call(method='POST',data={action:'import-daily',daily},token=env.HEALTH_INGEST_TOKEN,path='/api/training'){
 const req=new Request('https://example.workers.dev'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(data)}:{})});
 return worker.fetch(req,env);
}
assert.equal((await call('GET')).status,404);
assert.equal((await call('POST',undefined,'bad')).status,401);
assert.equal((await call('POST',{action:'import-daily',daily:{...daily,value:'29'}})).status,400);
assert.equal((await call('POST',{action:'import-daily',daily:{...daily,metric:'bloodPressure'}})).status,400);
assert.equal((await call('POST',{action:'import-daily',daily:{...daily,unit:'kcal'}})).status,400);
assert.equal((await call('POST',{action:'import-daily',daily:{...daily,date:'2026-02-30'}})).status,400);
assert.equal((await call('POST',{action:'import-daily',daily:{...daily,value:29}})).status,200);
assert.equal(saved.size,1);
assert.equal(saved.values().next().value.value,29);
assert.equal((await call('POST',{action:'import-daily',daily:{...daily,value:30}})).status,200);
assert.equal(saved.size,1,'Same metric/date replaces rather than duplicates');
assert.equal(saved.values().next().value.value,30);
assert.ok(validDaily(daily));
console.log('PASS: write-only, bearer authentication, strict daily schema, no KV, idempotent R2 staging');
