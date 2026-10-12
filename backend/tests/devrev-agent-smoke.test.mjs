import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newReport, invocationBody, invokeAgents, recordCallback, resultFor, ENDPOINT, REQUEST_ID } from '../scripts/devrev-agent-smoke.mjs';

const webhook = 'don:integration:dvrv-us-1:devo/17WZM4zcjj:webhook/smoke';
const session = 'don:core:dvrv-us-1:devo/17WZM4zcjj:ai_agent_session/101';
function callback(report, agent, type = 'progress', output) {
  return { payload: { ai_agent_response: { agent: agent.agentId, session_object: agent.sessionObject, session,
    client_metadata: { phase: 'gate-smoke-1', runId: report.runId, requestId: REQUEST_ID },
    agent_response: type, message: type === 'message' ? 'Read completed.' : undefined,
    progress: type === 'progress' ? {progress_state:'skill_executed',skill_executed:{skill_name:'GateGetRequest',output}} : undefined } } };
}
const gate = { mode:'sandbox',provider:'simulator',trace_id:'trace-from-gate',server_version:'0.4.1',
  data:{id:REQUEST_ID,workflowStatus:'AWAITING_EVIDENCE',policyVerdict:'REVIEW',consentStatus:'NONE',authorizationStatus:'NONE',payment:null} };

test('missing or production webhook prevents every network call', async () => {
  for (const id of [undefined, 'don:integration:dvrv-us-1:devo/17WZM4zcjj:webhook/dTAew19E']) {
    let calls = 0;
    await assert.rejects(invokeAgents(newReport(), 'private', id, async () => { calls++; }), /WEBHOOK/);
    assert.equal(calls, 0);
  }
});

test('invokes exactly the three real agents with read-only request instructions and captures sessions', async () => {
  const report = newReport(), calls = [];
  await invokeAgents(report, 'private_test_only', webhook, async (url, options) => {
    calls.push({url,body:options.body&&JSON.parse(options.body)});
    return new Response(JSON.stringify(url.endsWith('dev-users.self') ? {dev_user:{id:'don:identity:dvrv-us-1:devo/17WZM4zcjj:devu/4'}} : {session:{id:session}}),{status:200});
  });
  assert.equal(calls.length,4);
  assert.deepEqual(calls.slice(1).map(c=>c.body.agent),report.agents.map(a=>a.agentId));
  for (const call of calls.slice(1)) {
    assert.equal(call.url,ENDPOINT);
    assert.ok(call.body.event.input_message.message.includes(REQUEST_ID));
    assert.ok(call.body.event.input_message.message.includes('Do not call any other Gate tool'));
  }
  assert.ok(report.agents.every(a=>a.invocation==='ACCEPTED'&&a.sessionId===session&&resultFor(a)!=='PASS'));
});
test('wrong-org token fails before invocation; unknown dispatch is never retried', async () => {
  const report=newReport();let calls=0;
  await assert.rejects(invokeAgents(report,'private',webhook,async()=>{
    calls++;return new Response(JSON.stringify({dev_user:{id:'don:identity:dvrv-us-1:devo/OLD:devu/4'}}));
  }),/DEVREV_TOKEN_WRONG_ORG/);
  assert.equal(calls,1);
  for(const a of report.agents)a.invocation='UNKNOWN';
  calls=0;
  await invokeAgents(report,'private',webhook,async()=>{calls++;return new Response(JSON.stringify({dev_user:{id:'don:identity:dvrv-us-1:devo/17WZM4zcjj:devu/4'}}));});
  assert.equal(calls,1);
});
test('final text alone is not proof; matching successful tool output and final response are required',()=>{
  const report=newReport(),agent=report.agents[0];agent.invocation='ACCEPTED';agent.sessionId=session;
  recordCallback(report,callback(report,agent,'message'));
  assert.equal(resultFor(agent),'UNVERIFIED_MCP_EXECUTION');
  recordCallback(report,callback(report,agent,'progress',{content:[{type:'text',text:JSON.stringify(gate)}]}));
  assert.equal(resultFor(agent),'PASS');
  assert.equal(agent.events[1].gateResults[0].traceId,'trace-from-gate');
});
test('rejects cross-run, cross-agent and cross-session callbacks',()=>{
  const report=newReport(),agent=report.agents[0];agent.invocation='ACCEPTED';agent.sessionId=session;
  for(const change of [e=>e.client_metadata.runId='other',e=>e.agent=report.agents[1].agentId,e=>e.session=session+'x']) {
    const event=callback(report,agent,'progress',gate);change(event.payload.ai_agent_response);
    assert.throws(()=>recordCallback(report,event),/CALLBACK_/);
  }
  assert.equal(agent.events.length,0);
});

test('standard webhook root envelope preserves identical correlation requirements',()=>{
  const report=newReport(),agent=report.agents[0];agent.invocation='ACCEPTED';
  const nested=callback(report,agent,'progress',gate);
  recordCallback(report,{type:'ai_agent_response',ai_agent_response:nested.payload.ai_agent_response});
  assert.equal(agent.events[0].gateResults[0].requestId,REQUEST_ID);
});

test('the actual DevRev Gate connector namespace is recognized without accepting unrelated names',()=>{
  for(const name of ['custom__gate-mcp_GateGetRequest','unknown_GateGetRequest']) {
    const report=newReport(),agent=report.agents[0];agent.invocation='ACCEPTED';
    const event=callback(report,agent,'progress',gate);event.payload.ai_agent_response.progress.skill_executed.skill_name=name;
    recordCallback(report,event);recordCallback(report,callback(report,agent,'message'));
    assert.equal(resultFor(agent),name.startsWith('custom__')?'PASS':'UNVERIFIED_MCP_EXECUTION');
  }
});
test('tool failure, wrong request and invented prose do not pass; observed write tools fail',()=>{
  for(const output of [{isError:true,...gate},{...gate,data:{id:'wrong'}},'I called GateGetRequest successfully.']) {
    const report=newReport(),agent=report.agents[0];agent.invocation='ACCEPTED';
    recordCallback(report,callback(report,agent,'progress',output));recordCallback(report,callback(report,agent,'message'));
    assert.notEqual(resultFor(agent),'PASS');
  }
  const report=newReport(),agent=report.agents[0];agent.invocation='ACCEPTED';
  const write=callback(report,agent,'progress',gate);write.payload.ai_agent_response.progress.skill_executed.skill_name='GateRequestSpend';
  recordCallback(report,write);assert.equal(resultFor(agent),'FAILED_WRITE_TOOL_OBSERVED');
});
test('webhook target binding is explicit and credentials never enter invocation metadata',()=>{
  const report=newReport(),body=invocationBody(report,report.agents[0],'don:integration:dvrv-us-1:devo/17WZM4zcjj:webhook/1');
  assert.equal(body.webhook_target.webhook,'don:integration:dvrv-us-1:devo/17WZM4zcjj:webhook/1');assert.equal(body.client_metadata.requestId,REQUEST_ID);
  assert.equal(Object.hasOwn(body,'authorization'),false);
});

test('rejected API diagnostics redact bearer credentials',async()=>{
  const report=newReport();
  await invokeAgents(report,'private',webhook,async url=>new Response(JSON.stringify(url.endsWith('dev-users.self')
    ? {dev_user:{id:'don:identity:dvrv-us-1:devo/17WZM4zcjj:devu/4'}}
    : {type:'bad_request',message:'Invalid input Bearer private-secret'}),{status:url.endsWith('dev-users.self')?200:400}));
  assert.ok(report.agents.every(a=>a.invocation==='REJECTED'&&a.apiError.message==='Invalid input Bearer [REDACTED]'));
});

