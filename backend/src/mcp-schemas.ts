/** Discovery and the checked-in manifest share one source of tool schemas. */
import { z } from 'zod';
import { proposalSchema,idSchema,keySchema } from './contracts.js';
import { listInput } from './mcp-context.js';
export const SERVER_VERSION='0.3.0';
export const toolSchemas={
 gate_catalog:z.object({}).strict(),
 gate_search_context:z.object({query:z.string().min(2).max(200)}).strict(),
 gate_get_context:z.object({source_domain:z.enum(['pm','crm','document']),source_id:z.string().min(1).max(200)}).strict(),
 gate_preview_spend:proposalSchema,
 gate_request_spend:proposalSchema.extend({idempotency_key:keySchema}),
 gate_list_requests:listInput,
 gate_get_request:z.object({request_id:idSchema}).strict(),
};
export const toolOutputSchema=z.object({data:z.unknown(),mode:z.literal('sandbox'),provider:z.literal('simulator'),trace_id:z.string(),server_version:z.string(),dataset_version:z.null()});
