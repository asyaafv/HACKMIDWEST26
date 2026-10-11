/** Scoped MCP adapters consume shared evidence/payment services without duplicating financial logic. */
import { z } from 'zod';
import { transaction,type DB } from './db.js';
import type { Principal } from './contracts.js';
import { getSourceDetail,getSourceContext } from './evidence-service.js';
import { GateService } from './service.js';
import { requireThat } from './errors.js';
export const listInput=z.object({limit:z.number().int().min(1).max(50).default(10),cursor:z.string().max(1024).optional(),project_id:z.string().uuid().optional(),agent_id:z.string().uuid().optional(),
 status:z.enum(['AWAITING_EVIDENCE','AWAITING_CONSENT','REJECTED','AUTHORIZED','EXECUTING','COMPLETED','FAILED','RECONCILING','CANCELLED','EXPIRED']).optional()}).strict();
const cursorSchema=z.object({date:z.string().datetime(),id:z.string().uuid(),scope:z.string()}).strict();
export async function listRequests(db:DB,p:Principal,input:z.input<typeof listInput>) {
 const args=listInput.parse(input);let cursor:z.infer<typeof cursorSchema>|undefined;
 const scope=JSON.stringify([p.orgId,p.id,args.project_id??null,args.agent_id??null,args.status??null]);
 if(args.cursor) {try{cursor=cursorSchema.parse(JSON.parse(Buffer.from(args.cursor,'base64url').toString()));}catch{requireThat(false,'INVALID_CURSOR','Invalid cursor.',400);}requireThat(cursor.scope===scope,'INVALID_CURSOR','Cursor scope changed.',400);}
 return transaction(db,p.orgId,async tx=>{
  const rows=(await tx.query(`SELECT r.id,r.status,r.created_at,r.agent_id,r.project_id,r.amount_minor FROM requests r
   JOIN principal_projects g ON g.org_id=r.org_id AND g.project_id=r.project_id AND g.principal_id=$2
   JOIN agents a ON a.org_id=r.org_id AND a.id=r.agent_id WHERE r.org_id=$1 AND ($3 NOT IN ('AGENT','OPERATOR') OR a.owner_id=$2)
   AND ($4::uuid IS NULL OR r.project_id=$4) AND ($5::uuid IS NULL OR r.agent_id=$5) AND ($6::text IS NULL OR r.status=$6)
   AND ($7::timestamptz IS NULL OR (r.created_at,r.id)<($7::timestamptz,$8::uuid)) ORDER BY r.created_at DESC,r.id DESC LIMIT $9`,
   [p.orgId,p.id,p.capabilities?.includes('investigation:write')?'INVESTIGATOR':p.role,args.project_id??null,args.agent_id??null,args.status??null,cursor?.date??null,cursor?.id??null,args.limit+1])).rows;
  const more=rows.length>args.limit,items=rows.slice(0,args.limit),last=items.at(-1);
  return {items,limit:args.limit,coverage:'authorized requests only',partial:more,next_cursor:more?Buffer.from(JSON.stringify({date:new Date(last.created_at).toISOString(),id:last.id,scope})).toString('base64url'):null};
 });
}
export async function sourceContext(db:DB,p:Principal,domain:'pm'|'crm'|'document',sourceId:string) {
 return transaction(db,p.orgId,async tx=>{
  const source=await getSourceDetail(tx,p,domain,sourceId);requireThat(source,'NOT_FOUND','Source not found.',404);
  return {source,context:await getSourceContext(tx,p,source.projectId,{domain,sourceId}),coverage:'verified authorized relationships only'};
 });
}
export async function paymentDetail(db:DB,service:GateService,p:Principal,input:{request_id?:string;payment_id?:string}) {
 if(input.payment_id) return service.paymentDetail(p,input.payment_id);
 const request=await service.get(p,input.request_id!);
 requireThat(request.payment,'NOT_FOUND','Payment not found.',404);
 return service.paymentDetail(p,request.payment.id);
}
