import type {
  SendConversationAttachmentInput,
  McpAuthRemoveResult,
  McpAuthStartResult,
  McpRuntimeStatus,
  OpencodeFileContent,
  OpencodeFileNode,
  OpencodeFileSearchQuery,
  OpencodeFileStatus,
  OpencodeTextSearchMatch,
  ProviderAuthMethods,
  ProviderList,
  ProviderOauthAuthorization,
} from "@cc/shared/schemas";

export type OpenCodeSession = {
  id: string;
  parentID?: string;
  title?: string;
  time: { created: number; updated?: number; [key: string]: unknown };
  [key: string]: unknown;
};

export type OpenCodeSessionMessage = {
  info: {
    id: string;
    sessionID: string;
    role: "user" | "assistant";
    time: { created: number; completed?: number; [key: string]: unknown };
    [key: string]: unknown;
  };
  parts: { id: string; type: string; [key: string]: unknown }[];
};

export type OpenCodeSessionStatus = (
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number }
) &
  Record<string, unknown>;
export type OpenCodeTaskSessionStatus = OpenCodeSessionStatus | { type: "unknown" };
export type OpenCodeSessionStatusMap = Record<string, OpenCodeSessionStatus>;

export type OpenCodePendingPermission = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  always: string[];
  metadata: Record<string, unknown>;
  tool?: { messageID: string; callID: string; [key: string]: unknown };
  [key: string]: unknown;
};

export type OpenCodePendingQuestion = {
  id: string;
  sessionID: string;
  questions: Record<string, unknown>[];
  tool?: { messageID: string; callID: string; [key: string]: unknown };
  [key: string]: unknown;
};

export type OpenCodeSessionPermissionRule = {
  permission: string;
  pattern: string;
  action: "allow" | "deny" | "ask";
};

export type CreateOpenCodeSessionOptions = {
  title?: string;
  permission?: OpenCodeSessionPermissionRule[];
};

type SessionModel = {
  providerID: string;
  modelID: string;
};

export type OpenCodeService = {
  dispose(directory: string): Promise<void>;
  disposeGlobal(): Promise<void>;
  listProviders(directory: string): Promise<ProviderList>;
  listAuthMethods(directory: string): Promise<ProviderAuthMethods>;
  setApiKey(directory: string, providerId: string, apiKey: string): Promise<boolean>;
  startOauth(
    directory: string,
    providerId: string,
    method: number,
    inputs?: Record<string, string>,
  ): Promise<ProviderOauthAuthorization>;
  completeOauth(
    directory: string,
    providerId: string,
    method: number,
    code?: string,
  ): Promise<boolean>;
  disconnectProvider(directory: string, providerId: string): Promise<boolean>;
  listMcpStatus(directory: string): Promise<Record<string, McpRuntimeStatus>>;
  listMcpToolIds(directory: string): Promise<string[]>;
  startMcpAuth(directory: string, name: string): Promise<McpAuthStartResult>;
  completeMcpAuth(directory: string, name: string, code: string): Promise<McpRuntimeStatus>;
  authenticateMcp(directory: string, name: string): Promise<McpRuntimeStatus>;
  removeMcpAuth(directory: string, name: string): Promise<McpAuthRemoveResult>;
  createSession(
    directory: string,
    sessionOptions?: CreateOpenCodeSessionOptions,
  ): Promise<OpenCodeSession>;
  getSession(directory: string, sessionID: string): Promise<OpenCodeSession>;
  listSessionChildren: (
    directory: string,
    sessionID: string,
    signal?: AbortSignal,
  ) => Promise<OpenCodeSession[]>;
  getSessionTreeIds(
    directory: string,
    rootSessionID: string,
    signal?: AbortSignal,
  ): Promise<Set<string>>;
  listSessionMessages(
    directory: string,
    sessionID: string,
    signal?: AbortSignal,
  ): Promise<OpenCodeSessionMessage[]>;
  listSessionStatuses(directory: string, signal?: AbortSignal): Promise<OpenCodeSessionStatusMap>;
  getSessionStatus(
    directory: string,
    sessionID: string,
    signal?: AbortSignal,
  ): Promise<OpenCodeTaskSessionStatus>;
  promptSession(input: {
    directory: string;
    sessionID: string;
    agent: string;
    model: SessionModel;
    text: string;
    attachments?: SendConversationAttachmentInput[];
    system?: string;
    signal?: AbortSignal;
  }): Promise<OpenCodeSessionMessage>;
  commandSession(input: {
    directory: string;
    sessionID: string;
    agent: string;
    model: string;
    command: string;
    arguments: string;
    attachments?: SendConversationAttachmentInput[];
    signal?: AbortSignal;
  }): Promise<void>;
  summarizeSession(input: {
    directory: string;
    sessionID: string;
    providerID: string;
    modelID: string;
  }): Promise<void>;
  shellSession(input: {
    directory: string;
    sessionID: string;
    agent: string;
    model: SessionModel;
    command: string;
  }): Promise<void>;
  promptSessionAsync(input: {
    directory: string;
    sessionID: string;
    agent: string;
    model: SessionModel;
    text: string;
    attachments?: SendConversationAttachmentInput[];
    system?: string;
    signal?: AbortSignal;
  }): Promise<void>;
  replyPermission(
    directory: string,
    requestId: string,
    reply: "once" | "always" | "reject",
    signal?: AbortSignal,
  ): Promise<void>;
  listPendingPermissions(
    directory: string,
    signal?: AbortSignal,
  ): Promise<OpenCodePendingPermission[]>;
  replyQuestion(
    directory: string,
    requestId: string,
    answers: string[][],
    signal?: AbortSignal,
  ): Promise<void>;
  listPendingQuestions(directory: string, signal?: AbortSignal): Promise<OpenCodePendingQuestion[]>;
  rejectQuestion(directory: string, requestId: string, signal?: AbortSignal): Promise<void>;
  abortSession(directory: string, sessionID: string, signal?: AbortSignal): Promise<void>;
  deleteSession(directory: string, sessionID: string, signal?: AbortSignal): Promise<void>;
  findText(directory: string, pattern: string): Promise<OpencodeTextSearchMatch[]>;
  findFiles(directory: string, query: OpencodeFileSearchQuery): Promise<string[]>;
  listFiles(directory: string, path?: string): Promise<OpencodeFileNode[]>;
  readFile(directory: string, path: string): Promise<OpencodeFileContent>;
  getFileStatus(directory: string): Promise<OpencodeFileStatus[]>;
};

export class OpenCodeRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenCodeRequestError";
    this.status = status;
  }
}
