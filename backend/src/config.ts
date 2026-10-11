/** Validates operational settings; live payment modes are deliberately unsupported. */
import { z } from "zod";
export function configuration(env: NodeJS.ProcessEnv = process.env) {
  return z.object({
    DATABASE_URL: z.string().url(), HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8000),
    BROWSER_ALLOWED_HOSTS: z.string().default("localhost:8000,127.0.0.1:8000"),
    APP_MODE: z.literal("sandbox").default("sandbox"),
    ALLOWED_ORIGINS: z.string().default("http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000"),
    MCP_ALLOWED_HOSTS: z.string().default("localhost:8000,127.0.0.1:8000"),
  }).parse(env);
}
