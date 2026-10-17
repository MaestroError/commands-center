import type { RuntimeContext } from "../lib/start-server-runtime.js";
import type { ConversationEngine } from "../services/conversation-engine.js";

export type ConversationRouteContext = Pick<
  RuntimeContext,
  | "database"
  | "config"
  | "logger"
  | "sessionArchiveService"
  | "sessionArchiveSettingsService"
  | "systemPromptService"
  | "interactiveChatWatchdogService"
  | "liveRequestService"
> & { opencodeService: ConversationEngine };
