import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { CC_MANAGED_GROUP_METAS } from "../mcp/cc-managed/group-metadata.js";
import type { AppDb } from "../db/client.js";
import { BadRequestError } from "../lib/api-error.js";
import { writeConfigFileAtomic } from "../lib/config-file.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { createCustomToolService } from "../services/custom-tool-service.js";
import { createCustomToolActionService } from "../services/custom-tool-action-service.js";
import { createMcpServerService } from "../services/mcp-server-service.js";
import type { SecretService } from "../services/secret-service.js";
import { rewriteAgentsForMcpChange } from "../services/specialist-capability-sync.js";
import { createSpecialistService } from "../services/specialist-service.js";
import { buildEmbeddedMcpDefinitions, syncEmbeddedGlobalMcpConfig } from "./embedded-mcp-config.js";
import { renderEmbeddedToolEntry, renderEmbeddedToolTemplate } from "./embedded-custom-tools.js";
import type { EmbeddedRuntime } from "./embedded-runtime.js";
import {
  prepareEmbeddedSpecialistWorkspace,
  writeEmbeddedSpecialistWorkspace,
  syncEmbeddedSpecialistToolPlugins,
} from "./embedded-specialist-workspace.js";

export type EmbeddedWorkspaceServices = {
  reconcile(): Promise<void>;
  engine: EmbeddedRuntime["chat"] & { dispose(): Promise<void> };
  customTools: ReturnType<typeof createCustomToolService>;
  customToolActions: ReturnType<typeof createCustomToolActionService>;
  specialists: ReturnType<typeof createSpecialistService>;
  mcp: ReturnType<typeof createMcpServerService>;
};

export function createEmbeddedWorkspaceServices(options: {
  config: RuntimeConfig;
  db: AppDb;
  runtime: EmbeddedRuntime;
  secretService: SecretService;
}): EmbeddedWorkspaceServices {
  const { config, db, runtime, secretService } = options;
  const engine = { ...runtime.chat, dispose: () => runtime.reload() };
  const customTools = createCustomToolService({
    config,
    db,
    opencodeService: engine,
    renderTemplate: renderEmbeddedToolTemplate,
    renderEntryWrapper: renderEmbeddedToolEntry,
    listAgents: () => specialists.list(true),
    onWorkspaceChanged: async (workspacePath) => {
      const plugins = await syncEmbeddedSpecialistToolPlugins({
        workspacePath,
        customToolService: customTools,
      });
      const path = join(workspacePath, "opencode.jsonc");
      const current = z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(await readFile(path, "utf8")));
      await writeConfigFileAtomic(path, { ...current, plugins });
      await runtime.reload();
    },
  });
  const prepare: NonNullable<Parameters<typeof createSpecialistService>[0]["prepareWorkspace"]> = (
    input,
  ) =>
    prepareEmbeddedSpecialistWorkspace({
      ...input,
      db,
      customToolService: customTools,
      oauthCallbacks: runtime.callbacks,
    });
  const specialists = createSpecialistService({
    config,
    db,
    opencodeService: engine,
    customToolService: customTools,
    prepareWorkspace: prepare,
  });
  const customToolActions = createCustomToolActionService({
    customToolService: customTools,
    agentService: specialists,
  });
  const mcp = createMcpServerService({
    db,
    config,
    secretService,
    opencodeService: {
      ...engine,
      ...runtime.mcp,
      disposeGlobal: () => runtime.reload(),
      completeMcpAuth: () =>
        Promise.reject(
          new BadRequestError(
            "Complete MCP authorization in the browser callback, then check authentication status.",
          ),
        ),
    },
    requiresEngineRestart: () => Promise.resolve(false),
    rewriteAgents: (input) =>
      rewriteAgentsForMcpChange({
        ...input,
        opencodeService: { ...input.opencodeService, dispose: async () => {} },
        prepareWorkspace: (workspace) =>
          writeEmbeddedSpecialistWorkspace({
            ...workspace,
            db,
            customToolService: customTools,
            oauthCallbacks: runtime.callbacks,
          }),
      }),
    syncGlobalConfig: async () => {
      await syncEmbeddedGlobalMcpConfig(db, config, runtime.callbacks);
      const definitions = await buildEmbeddedMcpDefinitions(db, config, {}, runtime.callbacks);
      for (const specialist of await specialists.list(true)) {
        const path = join(specialist.workspacePath, "opencode.jsonc");
        const current = z
          .record(z.string(), z.unknown())
          .parse(JSON.parse(await readFile(path, "utf8")));
        const mcpConfig = z.record(z.string(), z.unknown()).parse(current["mcp"] ?? {});
        const previousServers = z.record(z.string(), z.unknown()).parse(mcpConfig["servers"] ?? {});
        const managed = Object.fromEntries(
          Object.entries(previousServers).filter(([name]) =>
            CC_MANAGED_GROUP_METAS.some((group) => group.name === name),
          ),
        );
        const external = Object.fromEntries(
          Object.entries(definitions).map(([name, definition]) => {
            const selection = specialist.capabilities.mcpServers.find(
              (server) => server.name === name,
            );
            return [
              name,
              {
                ...definition,
                disabled: definition.disabled === true || !selection?.enabled,
                codemode: false,
              },
            ];
          }),
        );
        await writeConfigFileAtomic(path, {
          ...current,
          mcp: { ...mcpConfig, servers: { ...managed, ...external } },
        });
      }
    },
  });
  return {
    engine,
    customTools,
    customToolActions,
    specialists,
    mcp,
    async reconcile() {
      for (const specialist of await specialists.list()) {
        await prepare({
          config,
          workspacePath: specialist.workspacePath,
          input: {
            ...specialist,
          },
          writeRules: false,
          missingSkillPolicy: "retain",
        });
      }
    },
  };
}
