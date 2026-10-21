// Isolated health-ingest Worker. Not deployed; configure a separate workers.dev Worker.
// Secrets: HEALTH_INGEST_TOKEN (>=32 random chars). R2 binding: RECEIPT_IMAGES.
// This endpoint is write-only. Do not route the private dashboard through this Worker.
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const types={steps:'count',activeEnergy:'kcal',restingEnergy:'kcal',workoutEnergy:'kcal'};
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const stampPattern=/(?:Z|[+-]\d{2}:\d{2})$/;
const encoder=new TextEncoder();
async function sameSecret(a,b){
 const digest=async v=>new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(v)));
 const [x,y]=await Promise.all([digest(a),digest(b)]);let diff=0;
 for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
 return diff===0;
}
export function validDaily(d){
 if(!d||typeof d!=='object'||Array.isArray(d)||d.kind!=='daily'||!Object.hasOwn(types,d.metric)||d.unit!==types[d.metric])return false;
 if(typeof d.value!=='number'||!Number.isFinite(d.value)||d.value<0||d.value>100000)return false;
 if(typeof d.date!=='string'||!datePattern.test(d.date)||new Date(d.date+'T00:00:00Z').toISOString().slice(0,10)!==d.date)return false;
 if(typeof d.observedAt!=='string'||!stampPattern.test(d.observedAt)||!Number.isFinite(Date.parse(d.observedAt))||Date.parse(d.observedAt)>Date.now()+300000)return false;
 if(d.sourceMethod!=='single-source'||d.sourceLabel!=='Mathias klocka')return false;
 const today=new Date().toISOString().slice(0,10);
 if(Math.abs(Date.parse(d.date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))>2*86400000)return false;
 return true;
}
export default {
 async fetch(request,env){
  try{
   const url=new URL(request.url);
   if(request.method!=='POST'||url.pathname!=='/api/training')return reply(404,{error:'Not found'});
   if(!env.HEALTH_INGEST_TOKEN||env.HEALTH_INGEST_TOKEN.length<32||!env.RECEIPT_IMAGES)return reply(503,{error:'Not configured'});
   const bearer=request.headers.get('authorization')||'';
   if(!/^Bearer [A-Za-z0-9_-]{32,128}$/.test(bearer)||!await sameSecret(bearer.slice(7),env.HEALTH_INGEST_TOKEN))return reply(401,{error:'Unauthorized'});
   if(Number(request.headers.get('content-length')||0)>2048)return reply(413,{error:'Payload too large'});
   const raw=await request.text();if(raw.length>2048)return reply(413,{error:'Payload too large'});
   let payload;try{payload=JSON.parse(raw)}catch{return reply(400,{error:'Invalid JSON'})}
   if(payload?.action!=='import-daily'||!validDaily(payload.daily))return reply(400,{error:'Invalid daily data'});
   const d=payload.daily;
   // Keep a distinct staging key. No health data is exposed through GET.
   const key='private-training/mathias/v1/staged-daily/'+d.date+'/'+d.metric+'.json';
   await env.RECEIPT_IMAGES.put(key,JSON.stringify({kind:d.kind,metric:d.metric,value:d.value,unit:d.unit,date:d.date,observedAt:new Date(d.observedAt).toISOString(),sourceMethod:d.sourceMethod,sourceLabel:d.sourceLabel,receivedAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json'}});
   return reply(200,{ok:true,metric:d.metric,date:d.date,staged:true});
  }catch{return reply(503,{error:'Try again later'})}
 }
};
