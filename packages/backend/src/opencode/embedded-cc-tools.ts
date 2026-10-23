import type { Tool } from "@opencode/sdk";
import { resolveMcpToolDefault } from "@cc/shared/schemas";

import { readEmbeddedToolProfile } from "./embedded-tool-profile.js";
import type { AppDb } from "../db/client.js";
import type { CcManagedMcpServerDefinition } from "../mcp/cc-managed/server-registry.js";
import { createEmbeddedCcTools } from "./embedded-cc-tool-adapter.js";
import {
  createEmbeddedToolCallerResolver,
  type EmbeddedToolCaller,
} from "./embedded-tool-caller.js";
import type { EmbeddedOpenCodeHost } from "./embedded-host.js";
import { requestEmbeddedToolPermission } from "./embedded-tool-permission.js";

export type EmbeddedCcTools = {
  list(directory: string): Tool.Info[];
  allowed(directory: string, sessionID: string): Promise<Set<string>>;
};

export function createEmbeddedCcToolService(options: {
  db: AppDb;
  specialistsDirectory: string;
  host: EmbeddedOpenCodeHost;
  groups: readonly CcManagedMcpServerDefinition[];
}): EmbeddedCcTools {
  const resolveCaller = createEmbeddedToolCallerResolver({
    db: options.db,
    specialistsDirectory: options.specialistsDirectory,
    getSession: (sessionID) => options.host.sessions.get({ sessionID }),
  });
  async function policy(
    caller: EmbeddedToolCaller,
  ): Promise<Map<string, "allow" | "ask" | "deny">> {
    const profile = await readEmbeddedToolProfile(options.db, caller);
    const result = new Map<string, "allow" | "ask" | "deny">();
    for (const group of options.groups) {
      const selection = profile.appMcpServers?.find((entry) => entry.name === group.name);
      const enabled = selection
        ? selection.enabled !== false && selection.action !== "deny"
        : group.enabledByDefault;
      for (const tool of group.tools) {
        const id = `${group.name}_${tool.name}`;
        const rule = profile.appToolPermissions?.find((entry) => entry.pattern === id);
        let action =
          caller.context === "task_run"
            ? (rule?.action ?? "deny")
            : resolveMcpToolDefault(
                {
                  toolPermissions: profile.appToolPermissions,
                  mcpServers: selection ? [selection] : [],
                },
                group.name,
                { id, name: tool.name },
              );
        if (!enabled || (tool.context !== "both" && tool.context !== caller.context))
          action = "deny";
        if (caller.context === "task_run" && action === "ask") action = "allow";
        result.set(id, action);
      }
    }
    return result;
  }
  return {
    list: (directory) =>
      createEmbeddedCcTools({
        directory,
        groups: options.groups,
        resolveCaller,
        async authorize({ toolID, caller, execution }) {
          const action = (await policy(caller)).get(toolID) ?? "deny";
          if (action === "deny") throw new Error("CC tool permission denied.");
          if (action === "ask") {
            await requestEmbeddedToolPermission(
              options.host,
              {
                sessionID: execution.sessionID,
                agent: execution.agent,
                action: toolID,
                resources: ["*"],
                source: { type: "tool", messageID: execution.messageID, id: execution.id },
              },
              execution.signal,
            );
          }
          const current = await resolveCaller(directory, execution.sessionID);
          if ((await policy(current)).get(toolID) === "deny")
            throw new Error("CC tool permission revoked.");
        },
      }),
    async allowed(directory, sessionID) {
      let caller: EmbeddedToolCaller;
      try {
        caller = await resolveCaller(directory, sessionID);
      } catch (error) {
        if (error instanceof Error && error.name === "CcToolCallerRejected")
          return new Set<string>();
        throw error;
      }
      return new Set(
        [...(await policy(caller))].filter(([, action]) => action !== "deny").map(([id]) => id),
      );
    },
  };
}
