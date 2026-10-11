/** API process entry point; restricted DB role and graceful shutdown bound its lifecycle. */
import { Pool } from "./db.js";
import { configuration, trustSettings } from "./config.js";
import { createApp } from "./app.js";

const config = configuration();
const db = new Pool({ connectionString: config.DATABASE_URL, options: "-c role=gate_runtime", max: 10 });
const app = createApp(db, { logger: true, paymentExecution: true, trust:trustSettings(config), trustPolling:true, demoWorkspace: config.DEMO_WORKSPACE_ORG_ID ? {orgId:config.DEMO_WORKSPACE_ORG_ID,principalId:config.DEMO_WORKSPACE_PRINCIPAL_ID!} : undefined, browserHosts: config.BROWSER_ALLOWED_HOSTS.split(",").filter(Boolean), origins: config.ALLOWED_ORIGINS.split(",").filter(Boolean), mcpHosts: config.MCP_ALLOWED_HOSTS.split(",").filter(Boolean), devrevIdentity: config.DEVREV_MCP_EMAIL ? {email:config.DEVREV_MCP_EMAIL,orgId:config.DEVREV_MCP_ORG_ID!,credentialId:config.DEVREV_MCP_CREDENTIAL_ID!} : undefined });
const stop = async () => { await app.close(); await db.end(); };
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
await app.listen({ host: config.HOST, port: config.PORT });
