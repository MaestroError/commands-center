import type { Logger } from "pino";

import type { OpencodeClient } from "../lib/opencode-client.js";
import { createScopedOpenCodeClient } from "../lib/opencode-client.js";
import { NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { z } from "zod";

import { resolvePromptAttachmentMimeType } from "@cc/shared/lib";
import {
  configProvidersSchema,
  mcpAuthRemoveResultSchema,
  mcpAuthStartResultSchema,
  mcpRuntimeStatusSchema,
  opencodeFileContentSchema,
  opencodeFileListResultSchema,
  opencodeFileSearchQuerySchema,
  opencodeFileSearchResultSchema,
  opencodeFileStatusResultSchema,
  opencodeTextSearchResultSchema,
  providerAuthMethodsSchema,
  providerListSchema,
  providerOauthAuthorizationSchema,
  type SendConversationAttachmentInput,
  type McpAuthRemoveResult,
  type McpAuthStartResult,
  type McpRuntimeStatus,
  type OpencodeFileContent,
  type OpencodeFileNode,
  type OpencodeFileSearchQuery,
  type OpencodeFileStatus,
  type OpencodeTextSearchMatch,
  type ProviderAuthMethods,
  type ProviderList,
  type ProviderOauthAuthorization,
} from "@cc/shared/schemas";

const openCodePartSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
  })
  .catchall(z.unknown());

const openCodeMessageSchema = z.object({
  info: z
    .object({
      id: z.string().min(1),
      sessionID: z.string().min(1),
      role: z.enum(["user", "assistant"]),
      time: z
        .object({
          created: z.number().int(),
          completed: z.number().int().optional(),
        })
        .catchall(z.unknown()),
    })
    .catchall(z.unknown()),
  parts: z.array(openCodePartSchema),
});

const openCodeSessionPermissionRuleSchema = z.object({
  permission: z.string().min(1),
  pattern: z.string().min(1),
  action: z.enum(["allow", "deny", "ask"]),
});

const openCodeSessionSchema = z
  .object({
    id: z.string().min(1),
    parentID: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    permission: z.array(openCodeSessionPermissionRuleSchema).optional(),
    time: z
      .object({
        created: z.number().int(),
        updated: z.number().int().optional(),
      })
      .catchall(z.unknown()),
  })
  .catchall(z.unknown());

const openCodeSessionStatusSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("idle") }).catchall(z.unknown()),
  z.object({ type: z.literal("busy") }).catchall(z.unknown()),
  z
    .object({
      type: z.literal("retry"),
      attempt: z.number().int().nonnegative(),
      message: z.string(),
      next: z.number().int().nonnegative(),
    })
    .catchall(z.unknown()),
]);

const openCodeSessionStatusMapSchema = z.record(z.string().min(1), openCodeSessionStatusSchema);

const openCodePendingPermissionSchema = z
  .object({
    id: z.string().min(1),
    sessionID: z.string().min(1),
    permission: z.string().min(1),
    patterns: z.array(z.string().min(1)),
    always: z.array(z.string().min(1)).default([]),
    metadata: z.record(z.string(), z.unknown()).default({}),
    tool: z
      .object({
        messageID: z.string().min(1),
        callID: z.string().min(1),
      })
      .catchall(z.unknown())
      .optional(),
  })
  .catchall(z.unknown());

const openCodePendingQuestionSchema = z
  .object({
    id: z.string().min(1),
    sessionID: z.string().min(1),
    questions: z.array(z.record(z.string(), z.unknown())).min(1),
    tool: z
      .object({
        messageID: z.string().min(1),
        callID: z.string().min(1),
      })
      .catchall(z.unknown())
      .optional(),
  })
  .catchall(z.unknown());

const openCodePendingPermissionListSchema = z.array(openCodePendingPermissionSchema);
const openCodePendingQuestionListSchema = z.array(openCodePendingQuestionSchema);
const MAX_SESSION_TREE_SIZE = 1_000;

export type OpenCodeSession = z.infer<typeof openCodeSessionSchema>;
export type OpenCodeSessionMessage = z.infer<typeof openCodeMessageSchema>;
export type OpenCodeSessionStatus = z.infer<typeof openCodeSessionStatusSchema>;
export type OpenCodeSessionStatusMap = z.infer<typeof openCodeSessionStatusMapSchema>;
export type OpenCodePendingPermission = z.infer<typeof openCodePendingPermissionSchema>;
export type OpenCodePendingQuestion = z.infer<typeof openCodePendingQuestionSchema>;

export type OpenCodeSessionPermissionRule = z.infer<typeof openCodeSessionPermissionRuleSchema>;

export type CreateOpenCodeSessionOptions = {
  title?: string;
  permission?: OpenCodeSessionPermissionRule[];
};

type SessionModel = {
  providerID: string;
  modelID: string;
};

type SessionAttachmentPart = {
  id?: string;
  type: "file";
  mime: string;
  filename?: string;
  url: string;
};

export type OpenCodeService = ReturnType<typeof createOpenCodeService>;

export function createOpenCodeService(options: {
  client: OpencodeClient;
  config: RuntimeConfig;
  logger: Logger;
}) {
  // Single-flight guard: coalesces concurrent disposeGlobal callers onto one
  // in-flight request so rapid invocations (e.g. double-click Refresh, React
  // Query re-invalidations) don't restart the opencode instance graph twice.
  let pendingDisposeGlobal: Promise<void> | null = null;

  async function listSessionChildren(
    directory: string,
    sessionID: string,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession[]> {
    const result = await requestSessionJson({
      config: options.config,
      directory,
      method: "GET",
      path: `/session/${encodeURIComponent(sessionID)}/children`,
      signal,
    });
    return z.array(openCodeSessionSchema).parse(result);
  }

  return {
    async dispose(directory: string): Promise<void> {
      const scoped = createScopedOpenCodeClient(options.config, directory);

      try {
        await scoped.instance.dispose();
      } catch {
        // Ignore dispose failures — fall back to stale instance state.
      }
    },

    async disposeGlobal(): Promise<void> {
      if (pendingDisposeGlobal) {
        return pendingDisposeGlobal;
      }

      pendingDisposeGlobal = (async () => {
        // The v1 SDK does not expose POST /global/dispose — use raw fetch.
        try {
          const url = new URL("/global/dispose", options.config.opencode.baseUrl);
          const response = await fetch(url, { method: "POST" });

          if (!response.ok) {
            const body = await response.text().catch(() => "");
            options.logger.warn(
              { status: response.status, body },
              "opencode global dispose returned non-2xx",
            );
          }
        } catch (error) {
          options.logger.warn({ err: error }, "opencode global dispose failed");
        }
      })().finally(() => {
        pendingDisposeGlobal = null;
      });

      return pendingDisposeGlobal;
    },

    async listProviders(directory: string): Promise<ProviderList> {
      const scoped = createScopedOpenCodeClient(options.config, directory);

      try {
        const result = await scoped.provider.list();
        return providerListSchema.parse(result);
      } catch {
        const result = await scoped.config.providers();
        const fallback = configProvidersSchema.parse(result);

        return providerListSchema.parse({
          all: fallback.providers,
          default: fallback.default,
          connected: fallback.providers.map((provider) => provider.id),
        });
      }
    },

    async listAuthMethods(directory: string): Promise<ProviderAuthMethods> {
      const scoped = createScopedOpenCodeClient(options.config, directory);
      const result = await scoped.provider.auth();
      return providerAuthMethodsSchema.parse(result);
    },

    async setApiKey(directory: string, providerId: string, apiKey: string): Promise<boolean> {
      const scoped = createScopedOpenCodeClient(options.config, directory);
      const result = await scoped.auth.set({
        path: { id: providerId },
        body: { type: "api", key: apiKey },
      });

      return (result as unknown) === true;
    },

    async startOauth(
      directory: string,
      providerId: string,
      method: number,
      inputs?: Record<string, string>,
    ): Promise<ProviderOauthAuthorization> {
      const scoped = createScopedOpenCodeClient(options.config, directory);
      const result = await scoped.provider.oauth.authorize({
        path: { id: providerId },
        body: { method, ...inputs },
      });

      return providerOauthAuthorizationSchema.parse(result);
    },

    async completeOauth(
      directory: string,
      providerId: string,
      method: number,
      code?: string,
    ): Promise<boolean> {
      const scoped = createScopedOpenCodeClient(options.config, directory);
      const result = await scoped.provider.oauth.callback({
        path: { id: providerId },
        body: { method, code },
      });

      return (result as unknown) === true;
    },

    async disconnectProvider(directory: string, providerId: string): Promise<boolean> {
      // The SDK does not expose DELETE /auth/{id} — use raw fetch.
      const url = new URL(
        `/auth/${encodeURIComponent(providerId)}`,
        options.config.opencode.baseUrl,
      );
      url.searchParams.set("directory", directory);

      const response = await fetch(url, { method: "DELETE" });

      if (!response.ok) {
        throw new Error(`Failed to disconnect provider ${providerId}: ${String(response.status)}`);
      }

      const contentType = response.headers.get("content-type");

      if (contentType?.includes("application/json")) {
        return (await response.json()) === true;
      }

      return true;
    },

    async listMcpStatus(directory: string): Promise<Record<string, McpRuntimeStatus>> {
      const result = await requestOpenCodeJson({
        config: options.config,
        directory,
        method: "GET",
        path: "/mcp",
      });

      return z.record(z.string(), mcpRuntimeStatusSchema).parse(result);
    },

    async listMcpToolIds(directory: string): Promise<string[]> {
      const result = await requestOpenCodeJson({
        config: options.config,
        directory,
        method: "GET",
        path: "/experimental/tool/ids",
      });

      return z.array(z.string()).parse(result);
    },

    async startMcpAuth(directory: string, name: string): Promise<McpAuthStartResult> {
      const result = await requestOpenCodeJson({
        config: options.config,
        directory,
        method: "POST",
        path: `/mcp/${encodeURIComponent(name)}/auth`,
      });

      return mcpAuthStartResultSchema.parse(result);
    },

    async completeMcpAuth(
      directory: string,
      name: string,
      code: string,
    ): Promise<McpRuntimeStatus> {
      const result = await requestOpenCodeJson({
        config: options.config,
        directory,
        method: "POST",
        path: `/mcp/${encodeURIComponent(name)}/auth/callback`,
        body: { code },
      });

      return mcpRuntimeStatusSchema.parse(result);
    },

    async authenticateMcp(directory: string, name: string): Promise<McpRuntimeStatus> {
      const result = await requestOpenCodeJson({
        config: options.config,
        directory,
        method: "POST",
        path: `/mcp/${encodeURIComponent(name)}/auth/authenticate`,
      });

      return mcpRuntimeStatusSchema.parse(result);
    },

    async removeMcpAuth(directory: string, name: string): Promise<McpAuthRemoveResult> {
      const result = await requestOpenCodeJson({
        config: options.config,
        directory,
        method: "DELETE",
        path: `/mcp/${encodeURIComponent(name)}/auth`,
      });

      return mcpAuthRemoveResultSchema.parse(result);
    },

    async createSession(
      directory: string,
      sessionOptions: CreateOpenCodeSessionOptions = {},
    ): Promise<OpenCodeSession> {
      const result = await requestSessionJson({
        config: options.config,
        directory,
        method: "POST",
        path: "/session",
        body: buildDefinedBody({
          title: sessionOptions.title,
          permission: sessionOptions.permission,
        }),
      });
      return openCodeSessionSchema.parse(result);
    },

    async getSession(directory: string, sessionID: string): Promise<OpenCodeSession> {
      const result = await requestSessionJson({
        config: options.config,
        directory,
        method: "GET",
        path: `/session/${encodeURIComponent(sessionID)}`,
      });
      return openCodeSessionSchema.parse(result);
    },

    async updateSessionPermissions(
      directory: string,
      sessionID: string,
      permission: OpenCodeSessionPermissionRule[],
    ): Promise<OpenCodeSession> {
      const result = await requestSessionJson({
        config: options.config,
        directory,
        method: "PATCH",
        path: `/session/${encodeURIComponent(sessionID)}`,
        body: { permission },
      });
      return openCodeSessionSchema.parse(result);
    },

    listSessionChildren,

    async getSessionTreeIds(
      directory: string,
      rootSessionID: string,
      signal?: AbortSignal,
    ): Promise<Set<string>> {
      const timeoutSignal = AbortSignal.timeout(options.config.timeouts.opencodeRequestMs);
      const traversalSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      const sessionIDs = new Set([rootSessionID]);
      const pending = [rootSessionID];

      while (pending.length > 0) {
        const parentID = pending.shift();
        if (!parentID) break;

        const children = await listSessionChildren(directory, parentID, traversalSignal);
        for (const child of children) {
          if (child.parentID !== parentID || sessionIDs.has(child.id)) continue;
          if (sessionIDs.size >= MAX_SESSION_TREE_SIZE) {
            throw new Error(
              `OpenCode session tree exceeds ${String(MAX_SESSION_TREE_SIZE)} sessions.`,
            );
          }
          sessionIDs.add(child.id);
          pending.push(child.id);
        }
      }

      return sessionIDs;
    },

    async listSessionMessages(
      directory: string,
      sessionID: string,
      signal?: AbortSignal,
    ): Promise<OpenCodeSessionMessage[]> {
      const result = await requestSessionJson({
        config: options.config,
        directory,
        method: "GET",
        path: `/session/${encodeURIComponent(sessionID)}/message`,
        signal,
      });
      return z.array(openCodeMessageSchema).parse(result);
    },

    async listSessionStatuses(
      directory: string,
      signal?: AbortSignal,
    ): Promise<OpenCodeSessionStatusMap> {
      const result = await requestSessionJson({
        config: options.config,
        directory,
        method: "GET",
        path: "/session/status",
        signal,
      });
      return openCodeSessionStatusMapSchema.parse(result);
    },

    async getSessionStatus(
      directory: string,
      sessionID: string,
      signal?: AbortSignal,
    ): Promise<OpenCodeSessionStatus> {
      const result = await requestSessionJson({
        config: options.config,
        directory,
        method: "GET",
        path: "/session/status",
        signal,
      });
      const statuses = openCodeSessionStatusMapSchema.parse(result);
      return statuses[sessionID] ?? { type: "idle" };
    },

    async promptSession(input: {
      directory: string;
      sessionID: string;
      agent: string;
      model: SessionModel;
      text: string;
      attachments?: SendConversationAttachmentInput[];
      system?: string;
      signal?: AbortSignal;
    }): Promise<OpenCodeSessionMessage> {
      // The synchronous /message endpoint returns the assistant message once the
      // turn settles. A terminal model failure (after opencode's own same-model
      // retries) lands in `info.error` with a 200 response — callers that need
      // failover must inspect the returned message rather than rely on a throw.
      const result = await requestSessionJson({
        config: options.config,
        directory: input.directory,
        method: "POST",
        path: `/session/${encodeURIComponent(input.sessionID)}/message`,
        body: {
          agent: input.agent,
          model: input.model,
          // `system` is additive (appended after the agent prompt) and applies
          // only to this generation, so callers send it on every message.
          ...(input.system ? { system: input.system } : {}),
          parts: buildPromptParts(input.text, input.attachments ?? []),
        },
        signal: input.signal,
      });

      return openCodeMessageSchema.parse(result);
    },

    async commandSession(input: {
      directory: string;
      sessionID: string;
      agent: string;
      model: string;
      command: string;
      arguments: string;
      attachments?: SendConversationAttachmentInput[];
    }): Promise<void> {
      await requestSessionJson({
        config: options.config,
        directory: input.directory,
        method: "POST",
        path: `/session/${encodeURIComponent(input.sessionID)}/command`,
        body: {
          agent: input.agent,
          model: input.model,
          command: input.command,
          arguments: input.arguments,
          parts: buildAttachmentParts(input.attachments ?? []),
        },
      });
    },

    async summarizeSession(input: {
      directory: string;
      sessionID: string;
      providerID: string;
      modelID: string;
    }): Promise<void> {
      await requestSessionJson({
        config: options.config,
        directory: input.directory,
        method: "POST",
        path: `/session/${encodeURIComponent(input.sessionID)}/summarize`,
        body: {
          providerID: input.providerID,
          modelID: input.modelID,
        },
      });
    },

    async shellSession(input: {
      directory: string;
      sessionID: string;
      agent: string;
      model: SessionModel;
      command: string;
    }): Promise<void> {
      await requestSessionJson({
        config: options.config,
        directory: input.directory,
        method: "POST",
        path: `/session/${encodeURIComponent(input.sessionID)}/shell`,
        body: {
          agent: input.agent,
          model: input.model,
          command: input.command,
        },
      });
    },

    async promptSessionAsync(input: {
      directory: string;
      sessionID: string;
      agent: string;
      model: SessionModel;
      text: string;
      attachments?: SendConversationAttachmentInput[];
      system?: string;
      signal?: AbortSignal;
    }): Promise<void> {
      await requestSessionJson({
        config: options.config,
        directory: input.directory,
        method: "POST",
        path: `/session/${encodeURIComponent(input.sessionID)}/prompt_async`,
        body: {
          agent: input.agent,
          model: input.model,
          ...(input.system ? { system: input.system } : {}),
          parts: buildPromptParts(input.text, input.attachments ?? []),
        },
        signal: input.signal,
      });
    },

    async replyPermission(
      directory: string,
      requestId: string,
      reply: "once" | "always" | "reject",
      signal?: AbortSignal,
    ): Promise<void> {
      await withNotFoundRemap(requestId, () =>
        requestSessionJson({
          config: options.config,
          directory,
          method: "POST",
          path: `/permission/${encodeURIComponent(requestId)}/reply`,
          body: { reply },
          signal,
        }),
      );
    },

    async listPendingPermissions(
      directory: string,
      signal?: AbortSignal,
    ): Promise<OpenCodePendingPermission[]> {
      const result = await requestSessionJson({
        config: options.config,
        directory,
        method: "GET",
        path: "/permission",
        signal,
      });
      return openCodePendingPermissionListSchema.parse(result);
    },

    async replyQuestion(
      directory: string,
      requestId: string,
      answers: string[][],
      signal?: AbortSignal,
    ): Promise<void> {
      await withNotFoundRemap(requestId, () =>
        requestSessionJson({
          config: options.config,
          directory,
          method: "POST",
          path: `/question/${encodeURIComponent(requestId)}/reply`,
          body: { answers },
          signal,
        }),
      );
    },

    async listPendingQuestions(
      directory: string,
      signal?: AbortSignal,
    ): Promise<OpenCodePendingQuestion[]> {
      const result = await requestSessionJson({
        config: options.config,
        directory,
        method: "GET",
        path: "/question",
        signal,
      });
      return openCodePendingQuestionListSchema.parse(result);
    },

    async rejectQuestion(
      directory: string,
      requestId: string,
      signal?: AbortSignal,
    ): Promise<void> {
      await withNotFoundRemap(requestId, () =>
        requestSessionJson({
          config: options.config,
          directory,
          method: "POST",
          path: `/question/${encodeURIComponent(requestId)}/reject`,
          body: {},
          signal,
        }),
      );
    },

    async abortSession(directory: string, sessionID: string, signal?: AbortSignal): Promise<void> {
      await requestSessionJson({
        config: options.config,
        directory,
        method: "POST",
        path: `/session/${encodeURIComponent(sessionID)}/abort`,
        body: {},
        signal,
      });
    },

    async deleteSession(directory: string, sessionID: string, signal?: AbortSignal): Promise<void> {
      await requestSessionJson({
        config: options.config,
        directory,
        method: "DELETE",
        path: `/session/${encodeURIComponent(sessionID)}`,
        signal,
      });
    },

    async findText(directory: string, pattern: string): Promise<OpencodeTextSearchMatch[]> {
      const result = await requestOpenCodeJson({
        config: options.config,
        directory,
        method: "GET",
        path: "/find",
        query: { pattern },
      });

      return opencodeTextSearchResultSchema.parse(result);
    },

    async findFiles(directory: string, query: OpencodeFileSearchQuery): Promise<string[]> {
      const parsedQuery = opencodeFileSearchQuerySchema.parse(query);
      const result = await requestOpenCodeJson({
        config: options.config,
        directory,
        method: "GET",
        path: "/find/file",
        query: buildDefinedQuery(parsedQuery),
      });

      return opencodeFileSearchResultSchema.parse(result);
    },

    async listFiles(directory: string, path?: string): Promise<OpencodeFileNode[]> {
      const result = await requestOpenCodeJson({
        config: options.config,
        directory,
        method: "GET",
        path: "/file",
        query: { path: path ?? "." },
      });

      return opencodeFileListResultSchema.parse(result);
    },

    async readFile(directory: string, path: string): Promise<OpencodeFileContent> {
      const result = await requestOpenCodeJson({
        config: options.config,
        directory,
        method: "GET",
        path: "/file/content",
        query: { path },
      });

      return opencodeFileContentSchema.parse(result);
    },

    async getFileStatus(directory: string): Promise<OpencodeFileStatus[]> {
      const result = await requestOpenCodeJson({
        config: options.config,
        directory,
        method: "GET",
        path: "/file/status",
      });

      return opencodeFileStatusResultSchema.parse(result);
    },
  };
}

function buildPromptParts(text: string, attachments: SendConversationAttachmentInput[]) {
  return [
    {
      type: "text" as const,
      text,
    },
    ...buildAttachmentParts(attachments),
  ];
}

function buildAttachmentParts(
  attachments: SendConversationAttachmentInput[],
): SessionAttachmentPart[] {
  return attachments.map((attachment) => {
    const mime = resolvePromptAttachmentMimeType(attachment.filename, attachment.mimeType);
    return {
      type: "file" as const,
      mime,
      filename: attachment.filename,
      url:
        mime === attachment.mimeType
          ? attachment.dataUrl
          : rewriteDataUrlMimeType(attachment.dataUrl, mime),
    };
  });
}

function rewriteDataUrlMimeType(dataUrl: string, mimeType: string): string {
  const commaIndex = dataUrl.indexOf(",");

  if (!dataUrl.startsWith("data:") || commaIndex === -1) {
    return dataUrl;
  }

  const metadata = dataUrl.slice("data:".length, commaIndex);
  const parameterIndex = metadata.indexOf(";");
  const parameters = parameterIndex === -1 ? "" : metadata.slice(parameterIndex);
  return `data:${mimeType}${parameters},${dataUrl.slice(commaIndex + 1)}`;
}

// Thrown by requestOpenCodeJson when OpenCode responds with a non-2xx status.
// Carries the original HTTP status so callers that care (e.g. remapping a
// stale permission/question reply to a 404) don't have to parse the message.
export class OpenCodeRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenCodeRequestError";
    this.status = status;
  }
}

// Reply/reject calls target a specific pending permission or question by id.
// If OpenCode no longer has it (already replied to, or timed out server-side),
// it responds 404 — surface that as a proper NotFoundError instead of the
// generic 500 an unrecognized thrown Error would otherwise produce, so the
// frontend can tell "stale prompt" apart from "something actually broke".
async function withNotFoundRemap<T>(requestId: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof OpenCodeRequestError && error.status === 404) {
      throw new NotFoundError(`Pending request "${requestId}" no longer exists.`);
    }

    throw error;
  }
}

async function requestSessionJson(options: {
  config: RuntimeConfig;
  directory: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<unknown> {
  return requestOpenCodeJson(options);
}

async function requestOpenCodeJson(options: {
  config: RuntimeConfig;
  directory: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}): Promise<unknown> {
  const url = new URL(options.path, options.config.opencode.baseUrl);
  url.searchParams.set("directory", options.directory);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined) {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: options.method,
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new OpenCodeRequestError(
      `OpenCode request failed: ${options.method} ${options.path} → ${String(response.status)}${body ? `: ${body}` : ""}`,
      response.status,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return true;
  }

  const text = await response.text();

  if (!text.trim()) {
    return true;
  }

  return JSON.parse(text) as unknown;
}

function buildDefinedQuery<T extends Record<string, string | number | boolean | undefined>>(
  query: T,
): T {
  return Object.fromEntries(
    Object.entries(query).filter((entry): entry is [string, string | number | boolean] => {
      return entry[1] !== undefined;
    }),
  ) as T;
}

function buildDefinedBody<T extends Record<string, unknown>>(body: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter((entry) => entry[1] !== undefined));
}
