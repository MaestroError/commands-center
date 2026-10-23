import type { McpRuntimeStatus } from "@cc/shared/schemas";

import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import type { OpenCodeService } from "../services/opencode-service.js";
import type { EmbeddedOpenCodeHost } from "./embedded-host.js";

import type { EmbeddedMcpOAuthCallbacks } from "./embedded-mcp-oauth-callbacks.js";

type Attempt = { integrationID: string; attemptID: string };

type McpHost = {
  mcp: Pick<EmbeddedOpenCodeHost["mcp"], "list" | "connect" | "disconnect">;
  model: Pick<EmbeddedOpenCodeHost["model"], "list">;
  integration: Pick<EmbeddedOpenCodeHost["integration"], "get" | "oauth">;
  credential: Pick<EmbeddedOpenCodeHost["credential"], "list" | "remove">;
  readTools: EmbeddedOpenCodeHost["readTools"];
};

export type EmbeddedMcpService = Pick<
  OpenCodeService,
  "listMcpStatus" | "listMcpToolIds" | "startMcpAuth" | "authenticateMcp" | "removeMcpAuth"
> & {
  connect(directory: string, name: string): Promise<void>;
  disconnect(directory: string, name: string): Promise<void>;
};

export function createEmbeddedMcpService(
  host: McpHost,
  callbacks?: EmbeddedMcpOAuthCallbacks,
): EmbeddedMcpService {
  const revocations = new Map<string, () => void>();
  function forget(attemptKey: string): void {
    revocations.get(attemptKey)?.();
    revocations.delete(attemptKey);
    attempts.delete(attemptKey);
  }
  const attempts = new Map<string, Attempt>();
  const key = (directory: string, name: string) => JSON.stringify([directory, name]);

  async function server(directory: string, name: string) {
    await host.model.list({ location: { directory } });
    const result = (await host.mcp.list({ location: { directory } })).data.find(
      (entry) => entry.name === name,
    );
    if (!result) throw new NotFoundError("MCP server not found.");
    return result;
  }

  return {
    async listMcpStatus(directory: string): Promise<Record<string, McpRuntimeStatus>> {
      await host.model.list({ location: { directory } });
      const servers = await host.mcp.list({ location: { directory } });
      return Object.fromEntries(
        servers.data.map((entry) => [
          entry.name,
          entry.name.replace(/[^a-zA-Z0-9_-]/g, "_") === "cc_custom"
            ? {
                status: "failed",
                error:
                  "This MCP name is reserved for custom scripts. Rename the integration to connect it.",
              }
            : entry.status.status === "pending"
              ? { status: "disconnected" }
              : entry.status,
        ]),
      );
    },
    async listMcpToolIds(directory: string): Promise<string[]> {
      const tools = await host.readTools(directory);
      if (!tools) return [];
      const names = (await host.mcp.list({ location: { directory } })).data
        .filter(
          (entry) =>
            entry.status.status === "connected" &&
            entry.name.replace(/[^a-zA-Z0-9_-]/g, "_") !== "cc_custom",
        )
        .map((entry) => entry.name.replace(/[^a-zA-Z0-9_-]/g, "_"));
      return tools
        .filter((tool) =>
          tool.namespace
            ? names.includes(tool.namespace)
            : names.some((name) => tool.id.startsWith(`${name}_`)),
        )
        .map((tool) => tool.id);
    },
    async connect(directory: string, name: string): Promise<void> {
      if (name.replace(/[^a-zA-Z0-9_-]/g, "_") === "cc_custom")
        throw new BadRequestError(
          "This MCP name is reserved for custom scripts. Rename the integration to connect it.",
        );
      await host.mcp.connect({ location: { directory }, server: name });
    },
    async disconnect(directory: string, name: string): Promise<void> {
      await host.mcp.disconnect({ location: { directory }, server: name });
    },
    async startMcpAuth(directory: string, name: string): Promise<{ authorizationUrl: string }> {
      const entry = await server(directory, name);
      if (!entry.integrationID) throw new BadRequestError("MCP server does not support OAuth.");
      const location = { directory };
      const integration = await host.integration.get({
        location,
        integrationID: entry.integrationID,
      });
      const method = integration.data.methods.find((item) => item.type === "oauth");
      if (!method) throw new BadRequestError("MCP OAuth method not found.");
      const previous = attempts.get(key(directory, name));
      if (previous) {
        await host.integration.oauth.cancel({ location, ...previous });
        forget(key(directory, name));
      }
      const attempt = await host.integration.oauth.connect({
        location,
        integrationID: entry.integrationID,
        methodID: method.id,
      });
      const identity = { integrationID: entry.integrationID, attemptID: attempt.data.attemptID };
      try {
        const revoke = callbacks?.track(
          attempt.data.url,
          attempt.data.time.expires,
          async () =>
            (await host.integration.oauth.status({ location, ...identity })).data.status ===
            "pending",
        );
        if (revoke) revocations.set(key(directory, name), revoke);
        attempts.set(key(directory, name), identity);
      } catch (error) {
        await host.integration.oauth.cancel({ location, ...identity });
        throw error;
      }
      return { authorizationUrl: attempt.data.url };
    },
    async authenticateMcp(directory: string, name: string): Promise<McpRuntimeStatus> {
      const attemptKey = key(directory, name);
      const attempt = attempts.get(attemptKey);
      if (attempt) {
        const { data } = await host.integration.oauth.status({
          location: { directory },
          ...attempt,
        });
        if (data.status === "pending") return { status: "needs_auth" };
        forget(attemptKey);
        if (data.status === "failed") throw new BadRequestError(data.message);
        if (data.status === "expired")
          throw new BadRequestError("MCP authorization expired. Start authorization again.");
      }
      if (name.replace(/[^a-zA-Z0-9_-]/g, "_") === "cc_custom")
        throw new BadRequestError(
          "This MCP name is reserved for custom scripts. Rename the integration to connect it.",
        );
      await host.mcp.connect({ location: { directory }, server: name });
      const entry = await server(directory, name);
      return entry.status.status === "pending" ? { status: "disconnected" } : entry.status;
    },
    async removeMcpAuth(directory: string, name: string): Promise<{ success: true }> {
      const entry = await server(directory, name);
      if (!entry.integrationID) throw new BadRequestError("MCP server does not support OAuth.");
      const attemptKey = key(directory, name);
      const attempt = attempts.get(attemptKey);
      if (attempt) {
        await host.integration.oauth.cancel({ location: { directory }, ...attempt });
        forget(attemptKey);
      }
      await host.mcp.disconnect({ location: { directory }, server: name });
      for (const credential of await host.credential.list()) {
        if (credential.integrationID === entry.integrationID)
          await host.credential.remove({ credentialID: credential.id });
      }
      return { success: true };
    },
  };
}
