import { expect,it } from 'vitest';
import { hasVerifiedStageEvidence,parseOrchestrationEvent } from '../src/orchestration.js';

const suggestion={payload:{type:'ai_agent_response',ai_agent_response:{agent:'don:core:dvrv-us-1:devo/17WZM4zcjj:ai_agent/4',
 session:'don:core:dvrv-us-1:devo/17WZM4zcjj:ai_agent_session/34',session_object:'gate-orchestration:test',
 client_metadata:{phase:'gate-orchestration-2',orgId:'a671aa2e-7767-445e-bd99-956616a0ba5a',
  requestId:'9de772b5-4c6f-41b1-9510-46eb74ac28b9',runId:'1b3d2844-0edb-4ba9-b44c-1920b7a7c1d8',
  stageId:'3c9527d8-0d54-44e7-8e47-b9360b8408bf',ordinal:1,promptHash:'a'.repeat(64)},
 agent_response:'suggestions',suggestions:['Optional follow-up']}}};

it('accepts suggestions as informational and requires verified MCP output plus a final result to complete',()=>{
 const event=parseOrchestrationEvent(suggestion);
 expect(event.agent_response).toBe('suggestions');
 expect(event.progress).toBeUndefined();
 expect(event.message).toBeUndefined();

 expect(hasVerifiedStageEvidence({dispatch_confirmed:true,tool_result:null,final_result:'advisory'})).toBe(false);
 expect(hasVerifiedStageEvidence({dispatch_confirmed:true,
  tool_result:{traceId:'8eac2a60-f55a-4c83-8129-37ba57264c4b',serverVersion:'0.4.1',facts:{}},final_result:null})).toBe(false);
 expect(hasVerifiedStageEvidence({dispatch_confirmed:true,
  tool_result:{traceId:'8eac2a60-f55a-4c83-8129-37ba57264c4b',serverVersion:'0.4.1',facts:{}},final_result:'advisory'})).toBe(true);
});
