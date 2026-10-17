import type { OpenCodeService } from "./opencode-service.js";

export type ConversationEngine = Pick<
  OpenCodeService,
  | "createSession"
  | "getSession"
  | "getSessionTreeIds"
  | "getSessionStatus"
  | "listSessionMessages"
  | "listProviders"
  | "promptSession"
  | "promptSessionAsync"
  | "commandSession"
  | "shellSession"
  | "summarizeSession"
  | "abortSession"
  | "deleteSession"
  | "listPendingPermissions"
  | "replyPermission"
  | "listPendingQuestions"
  | "replyQuestion"
  | "rejectQuestion"
>;
