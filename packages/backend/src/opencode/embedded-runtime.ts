import type { Logger } from "pino";

import { createEmbeddedChatEvents } from "./embedded-chat-events.js";
import { createEmbeddedChatService } from "./embedded-chat-service.js";
import {
  createEmbeddedOpenCodeHost,
  type EmbeddedOpenCodeHost,
  type EmbeddedOpenCodeHostOptions,
} from "./embedded-host.js";
import { createEmbeddedMcpOAuthCallbacks } from "./embedded-mcp-oauth-callbacks.js";
import { createEmbeddedMcpService } from "./embedded-mcp-service.js";
import { createEmbeddedProviderService } from "./embedded-provider-service.js";

export type EmbeddedRuntimeOptions = Omit<EmbeddedOpenCodeHostOptions, "environment"> & {
  logger: Logger;
  publicOrigin: string;
  resolveEnvironment: () => Promise<Record<string, string>>;
  prepareConfiguration: (
    callbacks: ReturnType<typeof createEmbeddedMcpOAuthCallbacks>,
  ) => Promise<void>;
};

type RuntimeState = "healthy" | "reloading" | "unhealthy" | "closing" | "closed";
export type EmbeddedRuntime = {
  host: EmbeddedOpenCodeHost;
  chat: ReturnType<typeof createEmbeddedChatService>;
  events: ReturnType<typeof createEmbeddedChatEvents>;
  providers: ReturnType<typeof createEmbeddedProviderService>;
  mcp: ReturnType<typeof createEmbeddedMcpService>;
  callbacks: ReturnType<typeof createEmbeddedMcpOAuthCallbacks>;
  reload(): Promise<void>;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
  getStatus(): { state: RuntimeState; healthy: boolean };
};

export async function createEmbeddedRuntime(
  options: EmbeddedRuntimeOptions,
): Promise<EmbeddedRuntime> {
  const callbacks = createEmbeddedMcpOAuthCallbacks(options.publicOrigin);
  let host: EmbeddedOpenCodeHost;
  try {
    await options.prepareConfiguration(callbacks);
    host = await createEmbeddedOpenCodeHost({
      workspaceDirectory: options.workspaceDirectory,
      sdkOptions: options.sdkOptions,
      environment: await options.resolveEnvironment(),
      ccTools: options.ccTools,
      mcpTools: options.mcpTools,
    });
  } catch (error) {
    callbacks.dispose();
    throw error;
  }
  const chat = createEmbeddedChatService(host);
  const events = createEmbeddedChatEvents({ host, chat, logger: options.logger });
  const providers = createEmbeddedProviderService(host, options.workspaceDirectory);
  const mcp = createEmbeddedMcpService(host, callbacks);
  let state: RuntimeState = "healthy";
  let pending = Promise.resolve();
  let closing: Promise<void> | undefined;

  function reload(): Promise<void> {
    if (closing) return Promise.reject(new Error("Embedded runtime is closing"));
    const operation = pending.then(async () => {
      state = "reloading";
      try {
        await options.prepareConfiguration(callbacks);
        await host.reload(await options.resolveEnvironment());
        state = "healthy";
      } catch (error) {
        state = "unhealthy";
        throw error;
      }
    });
    pending = operation.catch(() => undefined);
    return operation;
  }

  function close(): Promise<void> {
    closing ??= pending.then(async () => {
      state = "closing";
      callbacks.dispose();
      await host.close();
      state = "closed";
    });
    return closing;
  }

  return {
    host,
    chat,
    events,
    providers,
    mcp,
    callbacks,
    reload,
    close,
    [Symbol.asyncDispose]: close,
    getStatus(): { state: typeof state; healthy: boolean } {
      return {
        state: closing && state !== "closed" ? "closing" : state,
        healthy: !closing && state === "healthy",
      };
    },
  };
}
