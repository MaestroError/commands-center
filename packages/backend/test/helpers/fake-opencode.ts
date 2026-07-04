import { vi } from "vitest";

import type {
  CreateOpenCodeSessionOptions,
  OpenCodeService,
  OpenCodePendingPermission,
  OpenCodePendingQuestion,
  OpenCodeSession,
  OpenCodeSessionMessage,
  OpenCodeSessionStatus,
} from "../../src/services/opencode-service.js";

export type MockProviderList = {
  all: { id: string; models: Record<string, unknown> }[];
  default: Record<string, string>;
  connected: string[];
};

export type MockOpenCodeServiceOptions = {
  promptGate?: Promise<void>;
  promptGates?: Promise<void>[];
  providers?: MockProviderList;
  onPrompt?: (input: { model?: { providerID: string; modelID: string }; text: string }) => void;
  promptError?: (input: {
    model?: { providerID: string; modelID: string };
    text: string;
  }) => { name: string; message: string; data?: Record<string, unknown> } | undefined;
  promptTransportError?: Error;
  promptTransportErrors?: Error[];
  promptPostAcceptErrors?: Error[];
  createSessionErrors?: Error[];
  listSessionMessagesErrors?: Error[];
  sessionStatusErrors?: Error[];
  completeAsyncPrompt?: boolean;
  completeAsyncPromptAfter?: number;
  statusSequence?: OpenCodeSessionStatus[];
  pendingPermissions?: OpenCodePendingPermission[];
  pendingQuestions?: OpenCodePendingQuestion[];
  onStatus?: () => void;
  abortError?: Error;
};

/**
 * In-memory OpenCode service double mirroring the real session/prompt surface.
 * Ported from task-execution-service.test.ts so full-path lifecycle e2e tests
 * can drive execution + monitor + scheduler against a real SQLite database
 * without spawning an OpenCode process.
 */
export function createMockOpenCodeService(
  options: MockOpenCodeServiceOptions = {},
): OpenCodeService {
  const sessions = new Map<string, OpenCodeSession>();
  const messages = new Map<string, OpenCodeSessionMessage[]>();
  const statusSequence = [...(options.statusSequence ?? [])];
  const promptTransportErrors = [...(options.promptTransportErrors ?? [])];
  const promptPostAcceptErrors = [...(options.promptPostAcceptErrors ?? [])];
  const createSessionErrors = [...(options.createSessionErrors ?? [])];
  const listSessionMessagesErrors = [...(options.listSessionMessagesErrors ?? [])];
  const sessionStatusErrors = [...(options.sessionStatusErrors ?? [])];
  let sessionCount = 0;
  let messageCount = 0;
  let asyncPromptCount = 0;
  let time = Date.parse("2026-06-01T12:00:00.000Z");

  function nextTime(): number {
    time += 1_000;
    return time;
  }

  function nextMessageId(): string {
    messageCount += 1;
    return `message-${String(messageCount)}`;
  }

  return {
    createSession: vi.fn((_directory: string, sessionOptions?: CreateOpenCodeSessionOptions) => {
      const error = createSessionErrors.shift();

      if (error) {
        throw error;
      }

      sessionCount += 1;
      const session: OpenCodeSession = {
        id: `session-${String(sessionCount)}`,
        title: sessionOptions?.title,
        time: { created: nextTime(), updated: nextTime() },
      };
      sessions.set(session.id, session);
      messages.set(session.id, []);
      return Promise.resolve(session);
    }),
    getSession: (_directory: string, sessionID: string) => {
      const session = sessions.get(sessionID);

      if (!session) {
        throw new Error("Session not found.");
      }

      return Promise.resolve(session);
    },
    listSessionMessages: (_directory: string, sessionID: string) => {
      const error = listSessionMessagesErrors.shift();

      if (error) {
        throw error;
      }

      return Promise.resolve(messages.get(sessionID) ?? []);
    },
    listSessionStatuses: () => Promise.resolve({}),
    getSessionStatus: () => {
      const error = sessionStatusErrors.shift();

      if (error) {
        throw error;
      }

      options.onStatus?.();
      return Promise.resolve(statusSequence.shift() ?? { type: "idle" });
    },
    listPendingPermissions: vi.fn(() => Promise.resolve(options.pendingPermissions ?? [])),
    listPendingQuestions: vi.fn(() => Promise.resolve(options.pendingQuestions ?? [])),
    abortSession: vi.fn(() => {
      if (options.abortError) {
        throw options.abortError;
      }

      return Promise.resolve();
    }),
    listProviders: (_directory: string) =>
      Promise.resolve(options.providers ?? { all: [], default: {}, connected: [] }),
    promptSession: async ({
      sessionID,
      text,
      model,
    }: {
      sessionID: string;
      text: string;
      model?: { providerID: string; modelID: string };
    }) => {
      options.onPrompt?.({ model, text });
      await (options.promptGates?.shift() ?? options.promptGate);

      const transportError = promptTransportErrors.shift() ?? options.promptTransportError;

      if (transportError) {
        throw transportError;
      }

      const sessionMessages = messages.get(sessionID);
      const session = sessions.get(sessionID);

      if (!sessionMessages || !session) {
        throw new Error("Session not found.");
      }

      const userMessageId = nextMessageId();
      const assistantMessageId = nextMessageId();
      sessionMessages.push({
        info: {
          id: userMessageId,
          sessionID,
          role: "user",
          time: { created: nextTime() },
        },
        parts: [{ id: `part-${userMessageId}`, type: "text", text }],
      });
      const error = options.promptError?.({ model, text });
      const assistantMessage = createAssistantMessage({
        sessionID,
        assistantMessageId,
        text,
        error,
      });
      sessionMessages.push(assistantMessage);
      session.time.updated = nextTime();
      return assistantMessage;
    },
    promptSessionAsync: async ({
      sessionID,
      text,
      model,
    }: {
      sessionID: string;
      text: string;
      model?: { providerID: string; modelID: string };
    }) => {
      options.onPrompt?.({ model, text });
      await (options.promptGates?.shift() ?? options.promptGate);

      const transportError = promptTransportErrors.shift() ?? options.promptTransportError;

      if (transportError) {
        throw transportError;
      }

      const sessionMessages = messages.get(sessionID);
      const session = sessions.get(sessionID);

      if (!sessionMessages || !session) {
        throw new Error("Session not found.");
      }

      const promptIndex = asyncPromptCount;
      asyncPromptCount += 1;
      const userMessageId = nextMessageId();
      sessionMessages.push({
        info: {
          id: userMessageId,
          sessionID,
          role: "user",
          time: { created: nextTime() },
        },
        parts: [{ id: `part-${userMessageId}`, type: "text", text }],
      });

      const shouldComplete =
        options.completeAsyncPrompt === true ||
        (options.completeAsyncPromptAfter !== undefined &&
          promptIndex >= options.completeAsyncPromptAfter);
      if (shouldComplete) {
        const assistantMessageId = nextMessageId();
        const error = options.promptError?.({ model, text });
        sessionMessages.push(
          createAssistantMessage({
            sessionID,
            assistantMessageId,
            text,
            error,
          }),
        );
      }

      session.time.updated = nextTime();

      const postAcceptError = promptPostAcceptErrors.shift();

      if (postAcceptError) {
        throw postAcceptError;
      }
    },
  } as unknown as OpenCodeService;

  function createAssistantMessage(input: {
    sessionID: string;
    assistantMessageId: string;
    text: string;
    error?: { name: string; message: string; data?: Record<string, unknown> };
  }): OpenCodeSessionMessage {
    return {
      info: {
        id: input.assistantMessageId,
        sessionID: input.sessionID,
        role: "assistant",
        time: { created: nextTime(), completed: nextTime() },
        ...(input.error
          ? {
              error: {
                name: input.error.name,
                message: input.error.message,
                data: input.error.data ?? {},
              },
            }
          : {}),
      },
      parts: [
        {
          id: `part-${input.assistantMessageId}`,
          type: "text",
          text: `Task finished: ${input.text}`,
        },
      ],
    };
  }
}
