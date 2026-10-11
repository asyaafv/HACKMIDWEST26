/** Shared, Phase 1 verified DevRev protocol. No database or financial operations. */
import { createHash, timingSafeEqual } from 'node:crypto';
export const ENDPOINT = 'https://api.devrev.ai/internal/ai-agents.events.execute-async';
export const scrub = text => String(text).replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED JWT]');
export const canonicalTool = name => name?.replace(/^custom__gate-mcp_/, '').replace(/[^a-z]/gi, '').toLowerCase();
export const agentEvent = raw => raw?.payload?.ai_agent_response ?? (raw?.type === 'ai_agent_response' ? raw.ai_agent_response : undefined);
export const verificationChallenge = raw => {
  if(raw?.type!=='verify' && raw?.payload?.type!=='verify')return undefined;
  const value=raw.verify?.challenge??raw.payload?.verify?.challenge??raw.challenge??raw.payload?.challenge;
  if(typeof value!=='string'||!value.length||value.length>1024)throw new Error('INVALID_CHALLENGE');
  return value;
};
export function authenticatedWebhook(header, secret) {
  if(typeof header!=='string'||typeof secret!=='string'||secret.length<32)return false;
  const digest=value=>createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(header),digest(secret));
}
export function invocationPayload({agentId, versionId, sessionObject, metadata, message, webhookId}) {
  return {agent:agentId,...(versionId?{agent_version:versionId}:{}),session_object:sessionObject,
    client_metadata:metadata,event:{input_message:{message}},target:'webhook_target',webhook_target:{webhook:webhookId}};
}
export async function dispatchAsync(body, token, transport=fetch) {
  const response=await transport(ENDPOINT,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
  let result;
  try{result=await response.json();}catch{result={};}
  return {accepted:response.ok,httpStatus:response.status,sessionId:typeof result.session?.id==='string'?result.session.id:null,
    apiError:response.ok?null:{type:scrub(result.type??'UNREADABLE_API_ERROR').slice(0,200),
      message:scrub(result.message??'').slice(0,2000),detail:scrub(result.detail??'').slice(0,2000)}};
}
// Tool output only. A final agent message never constitutes MCP execution evidence.
export function gateEnvelopes(value, requestId, depth=0) {
  if(depth>12||value==null)return [];
  if(typeof value==='string') {
    if(value.length>262144)return [];
    try{return gateEnvelopes(JSON.parse(value),requestId,depth+1);}catch{return [];}
  }
  if(typeof value!=='object'||value.isError===true)return [];
  if(value.mode==='sandbox'&&value.provider==='simulator'&&value.data?.id===requestId&&typeof value.trace_id==='string')return [value];
  return Object.values(value).flatMap(child=>gateEnvelopes(child,requestId,depth+1));
}
