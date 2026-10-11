/** Validates operational settings; live payment modes are deliberately unsupported. */
import { z } from "zod";
export function configuration(env: NodeJS.ProcessEnv = process.env) {
  return z.object({
    DEMO_WORKSPACE_ORG_ID: z.string().uuid().optional(),
    DEMO_WORKSPACE_PRINCIPAL_ID: z.string().uuid().optional(),
    DATABASE_URL: z.string().url(), HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8000),
    BROWSER_ALLOWED_HOSTS: z.string().default("localhost:8000,127.0.0.1:8000"),
    APP_MODE: z.literal("sandbox").default("sandbox"),
    ALLOWED_ORIGINS: z.string().default("http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000"),
    MCP_ALLOWED_HOSTS: z.string().default("localhost:8000,127.0.0.1:8000"),
    DEVREV_API_TOKEN: z.string().min(1).optional(),
    DEVREV_TRUST_AGENT_ID: z.string().regex(/^don:core:[^:]+:devo\/[^:]+:ai_agent\/[^:]+$/).optional(),
    DEVREV_TRUST_WEBHOOK_ID: z.string().regex(/^don:integration:[^:]+:devo\/[^:]+:webhook\/[^:]+$/).optional(),
    DEVREV_TRUST_WEBHOOK_SECRET: z.string().min(32).optional(),
    DEVREV_TRUST_ENABLED: z.enum(["true","false"]).default("false").transform(v=>v==="true"),
    DEVREV_TRUST_TIMEOUT_SECONDS: z.coerce.number().int().min(15).max(300).default(60),
    DEVREV_MCP_EMAIL: z.string().email().optional(),
    DEVREV_MCP_ORG_ID: z.string().optional(),
    DEVREV_MCP_CREDENTIAL_ID: z.string().uuid().optional(),
  }).refine(v=>!v.DEVREV_TRUST_ENABLED || !!(v.DEVREV_API_TOKEN && v.DEVREV_TRUST_AGENT_ID && v.DEVREV_TRUST_WEBHOOK_ID && v.DEVREV_TRUST_WEBHOOK_SECRET), "Trust activation requires token, agent, webhook ID and webhook secret.").refine(v => Boolean(v.DEMO_WORKSPACE_ORG_ID) === Boolean(v.DEMO_WORKSPACE_PRINCIPAL_ID), "Configure both demo workspace IDs.")
    .refine(v => [v.DEVREV_MCP_EMAIL,v.DEVREV_MCP_ORG_ID,v.DEVREV_MCP_CREDENTIAL_ID].filter(Boolean).length === 0 || [v.DEVREV_MCP_EMAIL,v.DEVREV_MCP_ORG_ID,v.DEVREV_MCP_CREDENTIAL_ID].every(Boolean), "Configure all DevRev MCP identity fields.").parse(env);
}

export function trustSettings(config:ReturnType<typeof configuration>) {
 return {apiToken:config.DEVREV_API_TOKEN??'',agentId:config.DEVREV_TRUST_AGENT_ID??'',webhookId:config.DEVREV_TRUST_WEBHOOK_ID??'',
  webhookSecret:config.DEVREV_TRUST_WEBHOOK_SECRET??'',enabled:config.DEVREV_TRUST_ENABLED,timeoutSeconds:config.DEVREV_TRUST_TIMEOUT_SECONDS};
}
