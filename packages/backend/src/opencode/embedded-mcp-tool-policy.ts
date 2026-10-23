import { resolveMcpToolDefault } from "@cc/shared/schemas";
import { mcpRuntimeToolId } from "./embedded-mcp-permissions.js";
import type { AppDb } from "../db/client.js";
import type { EmbeddedOpenCodeHost } from "./embedded-host.js";
import { createEmbeddedToolCallerResolver } from "./embedded-tool-caller.js";
import { readEmbeddedToolProfile } from "./embedded-tool-profile.js";

export function createEmbeddedMcpToolPolicy(options: {
  db: AppDb;
  specialistsDirectory: string;
  host: EmbeddedOpenCodeHost;
}) {
  const resolve = createEmbeddedToolCallerResolver({
    ...options,
    getSession: (sessionID) => options.host.sessions.get({ sessionID }),
  });
  return async (
    directory: string,
    sessionID: string,
    server: string,
    tool: string,
  ): Promise<void> => {
    const caller = await resolve(directory, sessionID);
    const profile = await readEmbeddedToolProfile(options.db, caller);
    const rule = profile.mcpToolPermissions?.find(
      (entry) => entry.server === server && entry.tool === tool,
    );
    const legacy =
      caller.context === "task_run" &&
      profile.snapshotVersion === undefined &&
      profile.mcpToolPermissions === undefined;
    const action = legacy
      ? resolveMcpToolDefault({ ...profile, mcpServers: profile.mcpServers ?? [] }, server, {
          id: mcpRuntimeToolId(server, tool),
          name: tool,
        })
      : rule?.action;
    if (
      action === "deny" ||
      (caller.context === "task_run" && action !== "allow" && action !== "ask")
    ) {
      throw new Error("MCP tool permission denied.");
    }
    const status = (await options.host.mcp.list({ location: { directory } })).data.find(
      (entry) => entry.name === server,
    );
    if (caller.context === "task_run" && status?.status.status !== "connected")
      throw new Error("MCP server is unavailable.");
  };
}
export type EmbeddedMcpToolPolicy = ReturnType<typeof createEmbeddedMcpToolPolicy>;
