/** Reviewed live verification: advisory metadata writes, existing request reads only. */
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { factsFromRequest,AGENT_IDS } from '../src/orchestration-contracts.js';
import { hash } from '../src/hash.js';
const requestId='9de772b5-4c6f-41b1-9510-46eb74ac28b9';
async function main() {
 const base=new URL(process.env.GATE_API_BASE_URL??'http://127.0.0.1:8000');
 const local=['localhost','127.0.0.1','[::1]'].includes(base.hostname);
 if(base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('Use an origin URL without embedded credentials.');
 if(!local&&(base.protocol!=='https:'||!process.argv.includes('--reviewed-hosted')))throw new Error('Hosted verification requires HTTPS and explicit --reviewed-hosted after review.');
 if(local&&!['http:','https:'].includes(base.protocol))throw new Error('Unsupported protocol.');
 const token=process.env.GATE_COORDINATOR_TOKEN;
 if(!token||token.length<32)throw new Error('Privately set GATE_COORDINATOR_TOKEN to an existing scoped Gate OPERATOR or ADMIN credential.');
 const key=process.env.GATE_ORCHESTRATION_TEST_KEY??'phase2-readonly-9de772b5-v1';
 const api=async(path:string,body?:unknown)=>{
  const response=await fetch(new URL(path,base),{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json','Idempotency-Key':key}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw new Error(`Gate ${path} returned HTTP ${response.status}; inspect authenticated Gate diagnostics.`);
  return (await response.json() as any).data;
 };
 const before=factsFromRequest(await api(`/v1/requests/${requestId}`));
 if(before.consentStatus!=='NONE'||before.authorizationStatus!=='NONE'||before.paymentPresent)throw new Error('Demo request must have no consent, authorization or payment.');
 const {runId}=await api('/v1/orchestrations',{requestId});
 console.log(JSON.stringify({runId,requestId,mode:'read-only agents; advisory orchestration records only'}));
 const deadline=Date.now()+46*60*1000;
 let result:any;
 do {
  result=await api(`/v1/orchestrations/${runId}`);
  if(result.run.status!=='RUNNING')break;
  if(Date.now()>=deadline)throw new Error(`Verification wait expired for ${runId}; inspect status. No automatic replay performed.`);
  await new Promise(r=>setTimeout(r,3000));
 }while(true);
 const after=factsFromRequest(await api(`/v1/requests/${requestId}`));
 const unchanged=hash(before)===hash(after);
 const stages=result.stages.map((s:any)=>({ordinal:s.ordinal,agentId:s.agent_id,agentVersion:s.agent_version,sessionId:s.session_id,
  status:s.status,httpStatus:s.http_status,traceId:s.tool_result?.traceId??null,verifiedFacts:s.tool_result?.facts??null,
  findings:s.findings,errorCode:s.error_code}));
 const events=result.events.map((e:any)=>({receivedAt:e.received_at,deduplicationHash:e.event_hash,ignored:e.ignored,...e.event}));
 const report={runId,requestId,verifiedAt:new Date().toISOString(),status:result.run.status,errorCode:result.run.error_code,
  requestFactsUnchanged:unchanged,financialApproval:false,escalation:result.run.escalation,stages,events};
 const directory=resolve('work','devrev-orchestration');await mkdir(directory,{recursive:true});
 const path=resolve(directory,`${runId}.json`);await writeFile(path,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({report:path,status:report.status,requestFactsUnchanged:unchanged,stages},null,2));
 if(!unchanged)throw new Error('Request facts changed during verification; investigate concurrent activity.');
 if(!['COMPLETED','HUMAN_REVIEW_REQUIRED'].includes(report.status)||stages.length!==3||
   !stages.every((s:any,i:number)=>s.status==='SUCCEEDED'&&s.agentId===AGENT_IDS[i]&&s.agentVersion&&s.sessionId&&s.traceId&&s.findings
    &&hash(s.verifiedFacts)===hash(before)))
  throw new Error('Not all three real agent executions passed. Inspect the saved report; no automatic recovery performed.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Read-only verification failed.');process.exitCode=1;});
