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
    DEVREV_MCP_EMAIL: z.string().email().optional(),
    DEVREV_MCP_ORG_ID: z.string().optional(),
    DEVREV_MCP_CREDENTIAL_ID: z.string().uuid().optional(),
  }).refine(v => Boolean(v.DEMO_WORKSPACE_ORG_ID) === Boolean(v.DEMO_WORKSPACE_PRINCIPAL_ID), "Configure both demo workspace IDs.")
    .refine(v => [v.DEVREV_MCP_EMAIL,v.DEVREV_MCP_ORG_ID,v.DEVREV_MCP_CREDENTIAL_ID].filter(Boolean).length === 0 || [v.DEVREV_MCP_EMAIL,v.DEVREV_MCP_ORG_ID,v.DEVREV_MCP_CREDENTIAL_ID].every(Boolean), "Configure all DevRev MCP identity fields.").parse(env);
}
