/** Driver dependency failures stop before mutation; these are local contracts, not DevRev trigger proof. */
import { it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { runGatekeeperScenario } from '../scripts/gatekeeper-scenario.js';
import { proposalSchema } from '../src/contracts.js';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { toolSchemas,SERVER_VERSION } from '../src/mcp-schemas.js';
const options={proposal:proposalSchema.parse({agentId:randomUUID(),projectId:randomUUID(),merchantId:randomUUID(),amountMinor:'1',currency:'USD',category:'diagnostics',purpose:'Test',source:{domain:'pm',sourceId:'unit'}}),permissionToRecord:true,idempotencyKey:randomUUID()};
it('refuses missing tools before calling any tool',async()=>{
 let called=false;const client={listTools:async()=>({tools:[]}),callTool:async()=>{called=true;}} as unknown as Client;
 await expect(runGatekeeperScenario(client,options)).rejects.toMatchObject({code:'MISSING_TOOLS'});expect(called).toBe(false);
});
it('keeps the published manifest aligned with discovery signatures',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../computer/capability-manifest.json',import.meta.url),'utf8'));expect(manifest.version).toBe(SERVER_VERSION);
 for(const [name,schema] of Object.entries(toolSchemas))expect(manifest.tools.find((t:any)=>t.name===name).inputSchema).toEqual(z.toJSONSchema(schema));
 expect(manifest.tools).toHaveLength(Object.keys(toolSchemas).length);
});
