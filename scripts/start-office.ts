import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep this personal instance separate from every other Paperclip checkout.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.PAPERCLIP_HOME = path.join(root, ".paperclip-local");
process.env.PAPERCLIP_DEPLOYMENT_MODE = "local_trusted";
process.env.PAPERCLIP_BIND = "loopback";
process.env.HOST = "127.0.0.1";
process.env.PAPERCLIP_UI_DEV_MIDDLEWARE = "true";
process.env.PAPERCLIP_TELEMETRY_DISABLED = "1";

const { ensureAgentJwtSecret, ensureToolActionSigningSecret } = await import("../cli/src/config/env.js");
const configPath = path.join(process.env.PAPERCLIP_HOME, "instances/default/config.json");
process.env.PAPERCLIP_AGENT_JWT_SECRET = ensureAgentJwtSecret(configPath).secret;
process.env.PAPERCLIP_TOOL_ACTION_SIGNING_SECRET = ensureToolActionSigningSecret(configPath).secret;

console.log("Starting Paperclip AI Office at http://127.0.0.1:3100 (first load can take a few minutes).");
const { startServer } = await import("../server/src/index.js");
await startServer();
