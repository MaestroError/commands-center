import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { registerAgentRoutes } from "./agents.js";
import { registerConversationEventRoutes } from "./conversation-events.js";
import { registerConversationRoutes } from "./conversations.js";
import { registerFileManagerRoutes } from "./file-manager.js";
import { registerHealthRoutes } from "./health.js";
import { registerMcpServerRoutes } from "./mcp-servers.js";
import { registerProviderRoutes } from "./providers.js";
import { registerSearchRoutes } from "./search.js";
import { registerSecretRoutes } from "./secrets.js";
import { registerTerminalRoutes } from "./terminal.js";

export function registerApiRoutes(server: AppServer, context: RuntimeContext): void {
  registerHealthRoutes(server, context);
  registerAgentRoutes(server, context);
  registerConversationRoutes(server, context);
  registerConversationEventRoutes(server, context);
  registerFileManagerRoutes(server, context);
  registerSearchRoutes(server, context);
  registerMcpServerRoutes(server, context);
  registerProviderRoutes(server, context);
  registerSecretRoutes(server, context);
  registerTerminalRoutes(server, context);
}
