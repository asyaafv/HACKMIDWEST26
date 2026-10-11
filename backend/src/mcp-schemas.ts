/** Discovery and the checked-in manifest share one source of tool schemas. */
import { z } from 'zod';
import { proposalSchema,idSchema,keySchema } from './contracts.js';
import { startInvestigationSchema,submitEvidenceSchema,failInvestigationSchema } from './investigation-contracts.js';
import { listInput } from './mcp-context.js';
export const SERVER_VERSION='0.4.1';
export const toolSchemas={
 gate_list_investigations:z.object({limit:z.number().int().min(1).max(50).default(20)}).strict(),
 gate_start_investigation:startInvestigationSchema.extend({request_id:idSchema,idempotency_key:keySchema}),
 gate_submit_evidence:submitEvidenceSchema.extend({request_id:idSchema,idempotency_key:keySchema}),
 gate_fail_investigation:failInvestigationSchema.extend({request_id:idSchema,idempotency_key:keySchema}),
 gate_catalog:z.object({}).strict(),
 gate_search_context:z.object({query:z.string().min(2).max(200)}).strict(),
 gate_get_context:z.object({source_domain:z.enum(['pm','crm','document']),source_id:z.string().min(1).max(200)}).strict(),
 gate_preview_spend:proposalSchema,
 gate_request_spend:proposalSchema.extend({idempotency_key:keySchema}),
 gate_list_requests:listInput,
 gate_get_request:z.object({request_id:idSchema,validate_decision:z.boolean().optional()}).strict(),
};
export const toolOutputSchema=z.object({data:z.unknown(),mode:z.literal('sandbox'),provider:z.literal('simulator'),trace_id:z.string(),server_version:z.string(),dataset_version:z.null()});
