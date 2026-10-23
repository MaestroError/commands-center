import { mcpPermissionAction } from "./embedded-mcp-permissions.js";
import type { EmbeddedMcpToolPolicy } from "./embedded-mcp-tool-policy.js";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import type { OpenCode } from "@opencode/sdk";
import { requestEmbeddedToolPermission } from "./embedded-tool-permission.js";
import type { EmbeddedCcTools } from "./embedded-cc-tools.js";
import { CC_MANAGED_GROUP_METAS } from "../mcp/cc-managed/group-metadata.js";

import {
  buildNpmCacheEnv,
  buildOpenCodeStateEnv,
  ensureNpmCacheDir,
  ensureOpenCodeStateDirs,
} from "./opencode-env.js";

export type EmbeddedTool = {
  id: string;
  name: string;
  description: string;
  permission: string;
  namespace?: string;
};
export type EmbeddedOpenCodeHost = OpenCode.Interface & {
  readTools(directory: string, signal?: AbortSignal): Promise<EmbeddedTool[] | undefined>;
  listTools(directory: string, signal?: AbortSignal): Promise<EmbeddedTool[]>;
  reload(environment?: Record<string, string>): Promise<void>;
};

export type EmbeddedOpenCodeHostOptions = {
  workspaceDirectory: string;
  sdkOptions?: Pick<OpenCode.CreateOptions, "fs" | "models" | "log">;
  environment?: Record<string, string>;
  ccTools?: { current?: EmbeddedCcTools };
  mcpTools?: { current?: EmbeddedMcpToolPolicy };
};

let boundWorkspace: string | undefined;
let hostActive = false;

export async function createEmbeddedOpenCodeHost({
  workspaceDirectory,
  sdkOptions,
  environment = {},
  ccTools,
  mcpTools,
}: EmbeddedOpenCodeHostOptions): Promise<EmbeddedOpenCodeHost> {
  await mkdir(workspaceDirectory, { recursive: true });
  const workspace = await realpath(workspaceDirectory);
  if (boundWorkspace !== undefined && boundWorkspace !== workspace) {
    throw new Error("The embedded OpenCode workspace cannot change within a process");
  }
  if (hostActive) {
    throw new Error("An embedded OpenCode host is already active");
  }
  boundWorkspace = workspace;
  hostActive = true;

  const original = new Map<string, string | undefined>();
  let injected: NodeJS.ProcessEnv = {};
  function replaceEnvironment(next: NodeJS.ProcessEnv): void {
    for (const key of new Set([...Object.keys(injected), ...Object.keys(next)])) {
      if (!original.has(key)) original.set(key, process.env[key]);
      const value = key in next ? next[key] : original.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    injected = next;
  }

  try {
    const stateDirectory = join(workspace, ".cc", "opencode-v2");
    const npmCacheDirectory = join(stateDirectory, "npm-cache");
    await ensureOpenCodeStateDirs(stateDirectory);
    await ensureNpmCacheDir(npmCacheDirectory);
    const stateEnv = {
      ...buildOpenCodeStateEnv(stateDirectory),
      ...buildNpmCacheEnv(npmCacheDirectory),
    };
    replaceEnvironment({ ...environment, ...stateEnv });

    const { OpenCode } = await import("@opencode/sdk");
    const readers = new Map<string, (signal?: AbortSignal) => Promise<EmbeddedTool[]>>();
    const host = await OpenCode.create({
      plugins: [
        {
          id: "cc.tool-catalog",
          async setup(context) {
            const directory = await realpath(context.location.directory);
            if (ccTools) {
              await context.tool.transform((editor) => {
                for (const tool of ccTools.current?.list(directory) ?? []) editor.add(tool);
              });
              await context.session.hook("context", async (event) => {
                const allowed =
                  (await ccTools.current?.allowed(directory, event.sessionID)) ?? new Set<string>();
                for (const name of Object.keys(event.tools)) {
                  if (
                    CC_MANAGED_GROUP_METAS.some((group) => name.startsWith(`${group.name}_`)) &&
                    !allowed.has(name)
                  ) {
                    delete event.tools[name];
                  }
                }
              });
            }
            await context.mcp.transform((editor) => {
              for (const [name] of editor.list()) {
                if (name.replace(/[^a-zA-Z0-9_-]/g, "_") === "cc_custom")
                  editor.update(name, (server) => {
                    server.disabled = true;
                  });
              }
            });
            let mcpServers: { name: string }[] = [];
            if (mcpTools)
              await context.mcp.transform((editor) => {
                mcpServers = editor
                  .list()
                  .map(([name]) => ({ name }))
                  .filter(({ name }) => name.replace(/[^a-zA-Z0-9_-]/g, "_") !== "cc_custom");
              });
            const serverFor = (namespace: string | undefined) => {
              const matches = mcpServers.filter(
                (server) => server.name.replace(/[^a-zA-Z0-9_-]/g, "_") === namespace,
              );
              return matches.length === 1 ? matches[0]?.name : undefined;
            };
            if (mcpTools) {
              await context.tool.transform((editor) => {
                for (const tool of editor.list()) {
                  const server = serverFor(tool.options?.namespace);
                  if (
                    !server &&
                    mcpServers.some(
                      (entry) =>
                        entry.name.replace(/[^a-zA-Z0-9_-]/g, "_") === tool.options?.namespace,
                    )
                  ) {
                    editor.remove(tool.id);
                    continue;
                  }
                  if (server)
                    editor.update(tool.id, (entry) => {
                      entry.options = {
                        ...entry.options,
                        permission: mcpPermissionAction(server, tool.name),
                      };
                    });
                }
              });
              await context.tool.hook("execute.before", async (event) => {
                const tool = (await context.tool.list()).find((entry) => entry.id === event.tool);
                const server = serverFor(tool?.options?.namespace);
                if (server && tool) {
                  if (!mcpTools.current) throw new Error("MCP permissions are not initialized.");
                  await mcpTools.current(
                    context.location.directory,
                    event.sessionID,
                    server,
                    tool.name,
                  );
                }
              });
            }
            let initialized = false;
            const read = async (signal?: AbortSignal): Promise<EmbeddedTool[]> => {
              if (!initialized) {
                // SDK 2.0.27 publishes connected status before its 100ms MCP catalog debounce.
                await setTimeout(200, undefined, { signal });
                await context.tool.reload();
                initialized = true;
              }
              return (await context.tool.list()).map((tool) => ({
                id: tool.id,
                name: tool.name,
                description: tool.description,
                permission: tool.options?.permission ?? tool.id,
                namespace: tool.options?.namespace,
              }));
            };
            readers.set(directory, read);
            await context.tool.hook("execute.before", async (event) => {
              if (!event.tool.startsWith("cc_custom_")) return;
              await requestEmbeddedToolPermission(host, {
                sessionID: event.sessionID,
                agent: event.agent,
                action: event.tool,
                resources: ["*"],
                source: { type: "tool", messageID: event.messageID, id: event.id },
              });
            });
            return () => {
              if (readers.get(directory) === read) readers.delete(directory);
            };
          },
        },
      ],
      ...sdkOptions,
      database: { path: join(stateDirectory, "engine.db") },
      config: { directory: join(stateDirectory, "config", "opencode"), project: true },
      events: { persist: true },
    });
    let closing: Promise<void> | undefined;
    let pending = Promise.resolve();
    const close = (): Promise<void> => {
      closing ??= pending
        .then(() => host.close())
        .then(() => {
          replaceEnvironment({});
          hostActive = false;
        });
      return closing;
    };
    return {
      ...host,
      close,
      [Symbol.asyncDispose]: close,
      reload(nextEnvironment) {
        if (closing) return Promise.reject(new Error("Embedded OpenCode host is closing"));
        const operation = pending.then(async () => {
          environment = nextEnvironment ?? environment;
          replaceEnvironment({ ...environment, ...stateEnv });
          await host.location.reload();
        });
        pending = operation.catch(() => undefined);
        return operation;
      },
      async readTools(directory, signal) {
        const read = readers.get(await realpath(directory));
        return read?.(signal);
      },
      async listTools(directory, signal) {
        const location = { directory };
        await host.model.list({ location }, { signal });
        const servers = await host.mcp.list({ location }, { signal });
        await Promise.all(
          servers.data
            .filter((server) => server.status.status === "pending")
            .map((server) => host.mcp.connect({ location, server: server.name }, { signal })),
        );
        const read = readers.get(await realpath(directory));
        if (!read) throw new Error("OpenCode tool catalog is not initialized.");
        return read(signal);
      },
    };
  } catch (error) {
    replaceEnvironment({});
    hostActive = false;
    throw error;
  }
}
