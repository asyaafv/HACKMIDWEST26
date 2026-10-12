/** Actual coordinator records only; no browser agent invocation or fabricated findings. */
import { api } from './backend-service';
export interface CoordinatorAvailability {ready:boolean;blockers:string[];financialApproval:false}
export interface CoordinatorDetail {
 run:{id:string;status:string;error_code:string|null;snapshot:{version:number};escalation:null|{reason:string;nextAction:string;financialApproval:false}};
 stages:{id:string;ordinal:number;agent_id:string;agent_version:string;session_id:string|null;status:string;error_code:string|null;
  tool_result:null|{traceId:string};findings:null|{agentCommentary:{summary:string;findingCode:string};traceId:string}}[];
 events:{event_hash:string;event:{type:string;toolName?:string;progressState?:string};ignored:boolean}[];
}
export const coordinatorBlockers:Record<string,string>={
 ORCHESTRATION_DISABLED:'DevRev orchestration is disabled on the backend.',WORKSPACE_NOT_CONFIGURED:'The orchestration workspace is not configured.',
 WORKSPACE_NOT_AUTHORIZED:'Your workspace is not authorized for this coordinator.',DEVREV_API_NOT_CONFIGURED:'The backend DevRev API connection is not configured.',
 DEDICATED_WEBHOOK_NOT_CONFIGURED:'The dedicated authenticated callback webhook is not configured.',READ_ONLY_VERSIONS_NOT_CONFIGURED:'Published read-only agent versions are not configured.',
 ORCHESTRATION_SCHEMA_MISSING:'The orchestration database migration has not been applied.',
};
export async function latestCoordinatorRun(requestId:string) {
 const result=await api.call<{items:{id:string}[]}>(`/requests/${requestId}/orchestrations`);
 return result.items[0]?api.call<CoordinatorDetail>(`/orchestrations/${result.items[0].id}`):null;
}
export async function startCoordinatorReview(requestId:string,version:number) {
 return api.call<{runId:string}>('/orchestrations',{requestId},`orchestration:${requestId}:${version}`);
}
