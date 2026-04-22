import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { registerAgentRoutes } from "./agents.js";
import { registerConversationEventRoutes } from "./conversation-events.js";
import { registerConversationRoutes } from "./conversations.js";
import { registerHealthRoutes } from "./health.js";
import { registerMcpServerRoutes } from "./mcp-servers.js";
import { registerProviderRoutes } from "./providers.js";

export function registerApiRoutes(server: AppServer, context: RuntimeContext): void {
  registerHealthRoutes(server, context);
  registerAgentRoutes(server, context);
  registerConversationRoutes(server, context);
  registerConversationEventRoutes(server, context);
  registerMcpServerRoutes(server, context);
  registerProviderRoutes(server, context);
}
