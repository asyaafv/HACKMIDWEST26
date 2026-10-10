/** Validates operational settings; live payment modes are deliberately unsupported. */
import { z } from "zod";
export function configuration(env: NodeJS.ProcessEnv = process.env) {
  return z.object({
    DATABASE_URL: z.string().url(), HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8000),
    DEV_CONSOLE: z.enum(["true", "false"]).default("false"),
    BROWSER_ALLOWED_HOSTS: z.string().default("localhost:8000,127.0.0.1:8000"),
    APP_MODE: z.literal("sandbox").default("sandbox"),
    ALLOWED_ORIGINS: z.string().default("http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000"),
    MCP_ALLOWED_HOSTS: z.string().default("localhost:8000,127.0.0.1:8000"),
  }).refine(c => c.DEV_CONSOLE !== "true" || (["127.0.0.1", "localhost", "::1"].includes(c.HOST) && env.NODE_ENV !== "production"), "DEV_CONSOLE requires local non-production binding").parse(env);
}
