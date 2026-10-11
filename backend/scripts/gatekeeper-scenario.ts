/** Reusable real SDK driver records proposals only after explicit caller permission. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { proposalSchema,type Proposal } from '../src/contracts.js';
import { requireThat } from '../src/errors.js';
export async function callGateTool(client:Client,name:string,args:Record<string,unknown>) {
 const result=await client.callTool({name,arguments:args});
 requireThat(!result.isError,'TOOL_FAILED',`Gate tool ${name} failed.`);
 const envelope=result.structuredContent as {data:unknown}|undefined;
 requireThat(envelope,'INVALID_TOOL_OUTPUT','Structured Gate result required.');return envelope.data;
}
export async function runGatekeeperScenario(client:Client,options:{proposal:Proposal;permissionToRecord:boolean;idempotencyKey:string;requestId?:string}) {
 const required=options.requestId ? ['gate_get_request'] : ['gate_catalog','gate_get_context','gate_preview_spend','gate_request_spend','gate_get_request','gate_list_requests'];
 const discovered=(await client.listTools()).tools.map(t=>t.name);
 requireThat(required.every(t=>discovered.includes(t)),'MISSING_TOOLS','Required Gate tools unavailable.');
 if(options.requestId) return recoverGatekeeperOutcome(client,options.requestId);
 const proposal=proposalSchema.parse(options.proposal);
 const catalog=await callGateTool(client,'gate_catalog',{});
 const context=await callGateTool(client,'gate_get_context',{source_domain:proposal.source.domain,source_id:proposal.source.sourceId});
 const preview=await callGateTool(client,'gate_preview_spend',proposal);
 requireThat(options.permissionToRecord,'RECORD_PERMISSION_REQUIRED','Explicit permission to record required.');
 let recorded:unknown;
 try {recorded=await callGateTool(client,'gate_request_spend',{...proposal,idempotency_key:options.idempotencyKey});}
 catch(error) {
  await callGateTool(client,'gate_list_requests',{limit:10,project_id:proposal.projectId,agent_id:proposal.agentId});
  if ((error as {code?:string}).code==='TOOL_FAILED') throw error;
  recorded=await callGateTool(client,'gate_request_spend',{...proposal,idempotency_key:options.idempotencyKey});
 }
 const id=(recorded as {id:string}).id;
 return {catalog,context,preview,recorded,...await recoverGatekeeperOutcome(client,id)};
}
export async function recoverGatekeeperOutcome(client:Client,requestId:string) {
 return {request:await callGateTool(client,'gate_get_request',{request_id:requestId})};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const client=new Client({name:'Gatekeeper local scenario',version:'0.2.0'});
 try {
  const privateFile=process.argv[2];if(!privateFile) throw new Error('Private scenario JSON required');
  const input=JSON.parse(await readFile(privateFile,'utf8'));
  const url=new URL(input.url);requireThat(url.protocol==='https:' || (url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname)),'INVALID_ENDPOINT','HTTPS required remotely.');
  requireThat(!url.username&&!url.password&&!url.search&&!url.hash,'INVALID_ENDPOINT','Endpoint cannot contain secrets.');
  requireThat(typeof input.idempotencyKey==='string','INVALID_INPUT','Persist the logical submission key in the private scenario file.');
  await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${input.token}`}}}));
  const result=await runGatekeeperScenario(client,{proposal:input.proposal,permissionToRecord:input.permissionToRecord===true,idempotencyKey:input.idempotencyKey,requestId:input.requestId});
  console.log(JSON.stringify(result,null,2));
 } catch {console.error('Scenario failed; check identity, scopes, tool availability and saved submission key.');process.exitCode=1;}
 finally {await client.close();}
}
