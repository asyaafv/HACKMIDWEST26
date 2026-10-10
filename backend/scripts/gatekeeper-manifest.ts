/** Regenerate the versioned manifest directly from the discovery schemas. */
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { SERVER_VERSION,toolSchemas,toolOutputSchema } from '../src/mcp-schemas.js';
import { TOOL_CAPABILITIES } from '../src/capabilities.js';
await writeFile(new URL('../computer/capability-manifest.json',import.meta.url),JSON.stringify({version:SERVER_VERSION,transport:'stateless Streamable HTTP',authentication:'Gate bearer; server-owned identity',mode:'sandbox',provider:'simulator',remoteVerified:false,datasetVersion:'per-source; top-level null until a single active version is configured',tools:Object.entries(toolSchemas).map(([name,schema])=>({name,capability:TOOL_CAPABILITIES[name],inputSchema:z.toJSONSchema(schema),outputSchema:z.toJSONSchema(toolOutputSchema),readOnly:name!=='gate_request_spend',idempotent:true})),constraints:{gate_get_payment:'Exactly one of request_id or payment_id',gate_request_spend:'Explicit permission to record; same payload/key on retry; never finance consent',outputBytes:32768}},null,2)+'\n');
