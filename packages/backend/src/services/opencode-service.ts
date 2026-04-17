import type { OpencodeClient } from "../lib/opencode-client.js";
import { createScopedOpenCodeClient } from "../lib/opencode-client.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { z } from "zod";

import {
  configProvidersSchema,
  providerAuthMethodsSchema,
  providerListSchema,
  providerOauthAuthorizationSchema,
  type SendConversationAttachmentInput,
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

const openCodeSessionSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).optional(),
    time: z
      .object({
        created: z.number().int(),
        updated: z.number().int().optional(),
      })
      .catchall(z.unknown()),
  })
  .catchall(z.unknown());

export type OpenCodeSession = z.infer<typeof openCodeSessionSchema>;
export type OpenCodeSessionMessage = z.infer<typeof openCodeMessageSchema>;

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

export function createOpenCodeService(options: { client: OpencodeClient; config: RuntimeConfig }) {
  return {
    async dispose(directory: string): Promise<void> {
      const scoped = createScopedOpenCodeClient(options.config, directory);

      try {
        await scoped.instance.dispose();
      } catch {
        // Ignore dispose failures — fall back to stale instance state.
      }
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

    async createSession(directory: string, title?: string): Promise<OpenCodeSession> {
      const result = await requestSessionJson({
        config: options.config,
        directory,
        method: "POST",
        path: "/session",
        body: { title },
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

    async listSessionMessages(
      directory: string,
      sessionID: string,
    ): Promise<OpenCodeSessionMessage[]> {
      const result = await requestSessionJson({
        config: options.config,
        directory,
        method: "GET",
        path: `/session/${encodeURIComponent(sessionID)}/message`,
      });
      return z.array(openCodeMessageSchema).parse(result);
    },

    async promptSession(input: {
      directory: string;
      sessionID: string;
      agent: string;
      model: SessionModel;
      text: string;
      attachments?: SendConversationAttachmentInput[];
    }): Promise<void> {
      await requestSessionJson({
        config: options.config,
        directory: input.directory,
        method: "POST",
        path: `/session/${encodeURIComponent(input.sessionID)}/message`,
        body: {
          agent: input.agent,
          model: input.model,
          parts: buildPromptParts(input.text, input.attachments ?? []),
        },
      });
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

    promptSessionAsync(input: {
      directory: string;
      sessionID: string;
      agent: string;
      model: SessionModel;
      text: string;
      attachments?: SendConversationAttachmentInput[];
    }): void {
      // Fire-and-forget: dispatch without awaiting the full response.
      // The response will be delivered via SSE events.
      void requestSessionJson({
        config: options.config,
        directory: input.directory,
        method: "POST",
        path: `/session/${encodeURIComponent(input.sessionID)}/message`,
        body: {
          agent: input.agent,
          model: input.model,
          parts: buildPromptParts(input.text, input.attachments ?? []),
        },
      });
    },

    async replyPermission(
      directory: string,
      requestId: string,
      reply: "once" | "always" | "reject",
    ): Promise<void> {
      await requestSessionJson({
        config: options.config,
        directory,
        method: "POST",
        path: `/permission/${encodeURIComponent(requestId)}/reply`,
        body: { reply },
      });
    },

    async replyQuestion(directory: string, requestId: string, answers: string[][]): Promise<void> {
      await requestSessionJson({
        config: options.config,
        directory,
        method: "POST",
        path: `/question/${encodeURIComponent(requestId)}/reply`,
        body: { answers },
      });
    },

    async rejectQuestion(directory: string, requestId: string): Promise<void> {
      await requestSessionJson({
        config: options.config,
        directory,
        method: "POST",
        path: `/question/${encodeURIComponent(requestId)}/reject`,
        body: {},
      });
    },

    async abortSession(directory: string, sessionID: string): Promise<void> {
      await requestSessionJson({
        config: options.config,
        directory,
        method: "POST",
        path: `/session/${encodeURIComponent(sessionID)}/abort`,
        body: {},
      });
    },

    async searchWorkspaceFiles(directory: string, query: string): Promise<string[]> {
      const scoped = createScopedOpenCodeClient(options.config, directory);
      const result = await scoped.find.files({ query: { query } });
      return z.array(z.string()).parse(result);
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
  return attachments.map((attachment) => ({
    id: attachment.id,
    type: "file",
    mime: attachment.mimeType,
    filename: attachment.filename,
    url: attachment.dataUrl,
  }));
}

async function requestSessionJson(options: {
  config: RuntimeConfig;
  directory: string;
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(options.path, options.config.opencode.baseUrl);
  url.searchParams.set("directory", options.directory);

  const response = await fetch(url, {
    method: options.method,
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`OpenCode request failed with status ${String(response.status)}.`);
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
