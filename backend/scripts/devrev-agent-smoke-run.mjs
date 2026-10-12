/** Explicitly authorized temporary collector/tunnel/webhook lifecycle. Never accesses Gate DB. */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokeAgents, resultFor } from './devrev-agent-smoke.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const reportPath = resolve(process.argv[2] ?? '');
const tunnelPath = resolve(process.argv[3] ?? '');
if (!process.argv[2] || !process.argv[3] || !process.env.GATE_DEVREV_API_TOKEN) throw new Error('PRIVATE_CONFIG_REQUIRED');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
if (report.agents.some(a => a.invocation !== 'NOT_RUN')) throw new Error('FRESH_REPORT_REQUIRED');
const token = process.env.GATE_DEVREV_API_TOKEN;
const secret = randomBytes(16).toString('hex');
const operations = { runId: report.runId, startedAt:new Date().toISOString(), webhookId: null, tunnelStarted: false, collectorStarted: false, callbackAuthenticationVerified: false };
const saveOperations = () => writeFile(`${reportPath}.operations.json`, JSON.stringify(operations, null, 2));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Resolve only the temporary public tunnel hostname via DoH; preserve HTTPS hostname/SNI verification.
const probe = (url, ip, headers, body) => new Promise((resolve,reject) => {
  const req=httpsRequest(url,{method:'POST',headers,lookup:(_host,options,callback)=>{
    callback(null,options?.all?[{address:ip,family:4}]:ip,4);
  }},res=> {
    let text='';res.on('data',chunk=>{text+=chunk;});res.on('end',()=>resolve({status:res.statusCode,text}));
  });
  req.setTimeout(5000,()=>req.destroy(new Error('PROBE_TIMEOUT')));req.on('error',reject);req.end(body);
});
let collector, tunnel;
const api = async (method, body) => {
  const response = await fetch(`https://api.devrev.ai/internal/${method}`, { method: 'POST', redirect: 'error',
    headers: {Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`DEVREV_${method.replaceAll('.','_')}_HTTP_${response.status}`);
  return data;
};
const stop = child => new Promise(resolve => {
  if (!child || child.exitCode !== null) { resolve(); return; }
  child.once('exit',resolve); child.kill(); setTimeout(resolve,3000);
});
try {
  collector = spawn(process.execPath,[resolve(scriptDir,'devrev-agent-smoke.mjs'),'listen',reportPath],{
    windowsHide:true,env:{...process.env,GATE_DEVREV_WEBHOOK_SECRET:secret},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject) => {
    const timer = setTimeout(()=>reject(new Error('COLLECTOR_START_TIMEOUT')),10000);
    collector.stdout.on('data',chunk=> { if(String(chunk).includes('Isolated smoke callback listener')) {clearTimeout(timer);resolve();} });
    collector.once('error',()=>{clearTimeout(timer);reject(new Error('COLLECTOR_START_FAILED'));});
    collector.once('exit',()=>{clearTimeout(timer);reject(new Error('COLLECTOR_EXITED'));});
  });
  operations.collectorStarted=true;
  tunnel = spawn(tunnelPath,['tunnel','--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:8789'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const url = await new Promise((resolve,reject)=> {
    const timer=setTimeout(()=>reject(new Error('TUNNEL_START_TIMEOUT')),45000);
    const consume=chunk=> {
      operations.tunnelDiagnostics=((operations.tunnelDiagnostics??'')+String(chunk)).slice(-6000);
      const found=String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if(found && !['https://api.trycloudflare.com','https://www.trycloudflare.com'].includes(found[0])){clearTimeout(timer);resolve(found[0]);}
    };
    tunnel.stdout.on('data',consume);tunnel.stderr.on('data',consume);
    tunnel.once('error',()=>{clearTimeout(timer);reject(new Error('TUNNEL_START_FAILED'));});
  });
  operations.tunnelStarted=true;
  operations.callbackHostname=new URL(url).hostname;
  const callbackUrl = `${url}/callback`;
  let ip;
  for(let attempt=0;attempt<75;attempt++) {
    const dnsResponse=await fetch(`https://cloudflare-dns.com/dns-query?name=${operations.callbackHostname}&type=A`,{
      headers:{Accept:'application/dns-json'},signal:AbortSignal.timeout(10000)});
    const dns=await dnsResponse.json();
    const answer=dns.Answer?.find(a=>a.type===1)?.data;
    if(dnsResponse.ok&&dns.Status===0&&answer&&/^\d+\.\d+\.\d+\.\d+$/.test(answer)){ip=answer;break;}
    await sleep(2000);
  }
  if(!ip)throw new Error('TUNNEL_DOH_FAILED');
  operations.probeDnsMethod='Cloudflare DNS-over-HTTPS';
  let verified=false;
  for(let attempt=0;attempt<12;attempt++) {
    try {
      const unauth=await probe(callbackUrl,ip,{},'{}');
      const auth=await probe(callbackUrl,ip,{'x-api-key':secret,'Content-Type':'application/json'},
        JSON.stringify({type:'verify',verify:{challenge:'phase-one-check'}}));
      operations.callbackHttpStatuses={unauthenticated:unauth.status,authenticated:auth.status};
      verified=unauth.status===401&&auth.status===200&&JSON.parse(auth.text).challenge==='phase-one-check';
      if(verified)break;
    } catch(error) {operations.callbackTransportError=error.cause?.code??error.name;}
    await sleep(2000);
  }
  if(!verified)throw new Error('CALLBACK_AUTH_CHECK_FAILED');
  operations.callbackAuthenticationVerified=true;
  const created=await api('webhooks.create',{url:callbackUrl,event_types:['ai_agent_response'],secret,
    headers:[{name:'x-api-key',value:secret}]});
  operations.webhookId=created.webhook?.id;
  operations.webhookStatus=created.webhook?.status;
  if(!operations.webhookId)throw new Error('WEBHOOK_ID_MISSING');
  await saveOperations();
  for(let attempt=0;attempt<30;attempt++) {
    const current=await api('webhooks.get',{id:operations.webhookId});
    operations.webhookStatus=current.webhook?.status;
    if(operations.webhookStatus==='active')break;
    await sleep(2000);
  }
  if(operations.webhookStatus!=='active')throw new Error('WEBHOOK_NOT_ACTIVE');
  await saveOperations();
  console.log(JSON.stringify({stage:'ISOLATED_CALLBACK_READY',webhookId:operations.webhookId,authenticationVerified:true}));
  await invokeAgents(report,token,operations.webhookId,fetch,()=>writeFile(reportPath,JSON.stringify(report,null,2)));
  console.log(JSON.stringify({stage:'DISPATCHED',agents:report.agents.map(a=>({agentId:a.agentId,httpStatus:a.httpStatus,apiError:a.apiError,invocation:a.invocation,sessionId:a.sessionId}))}));
  const until=Date.now()+300000;
  while(Date.now()<until) {
    let callbacks;
    try {callbacks=JSON.parse(await readFile(`${reportPath}.callbacks.json`,'utf8'));}catch{}
    if(callbacks?.runId===report.runId) {
      for(const a of report.agents) {
        const evidence=callbacks.agents.find(e=>e.agentId===a.agentId);
        if(evidence) {a.events=evidence.events;a.sessionId??=evidence.sessionId;}
      }
    }
    if(report.agents.every(a=>a.invocation==='REJECTED'||a.events.some(e=>['message','error'].includes(e.type))))break;
    await sleep(2000);
  }
  console.log(JSON.stringify({stage:'RESULT',agents:report.agents.map(a=>({agentId:a.agentId,sessionId:a.sessionId,
    result:resultFor(a),callbacks:a.events.length,mcpResults:a.events.flatMap(e=>e.gateResults)}))}));
  if(!report.agents.every(a=>resultFor(a)==='PASS'))process.exitCode=1;
}catch(error){
  operations.failure=/^[A-Z0-9_]+$/.test(error.message)?error.message:'SMOKE_RUN_FAILED';
  console.log(JSON.stringify({stage:'BLOCKED',reason:operations.failure}));process.exitCode=1;
}finally{
  if(operations.webhookId) {
    try {await api('webhooks.delete',{id:operations.webhookId});operations.webhookDeleted=true;}
    catch{operations.webhookDeleted=false;process.exitCode=1;}
  }
  await stop(tunnel);await stop(collector);
  operations.tunnelStopped=!tunnel||tunnel.exitCode!==null||tunnel.signalCode!==null;
  operations.collectorStopped=!collector||collector.exitCode!==null||collector.signalCode!==null;
  operations.finishedAt=new Date().toISOString();
  await saveOperations();const {tunnelDiagnostics,...summary}=operations;console.log(JSON.stringify({stage:'CLEANUP',...summary}));
}
