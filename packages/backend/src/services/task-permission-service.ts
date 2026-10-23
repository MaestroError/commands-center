import { join } from "node:path";
import { resolveMcpToolDefault } from "@cc/shared/schemas";
import type { McpToolPermissionService } from "./mcp-tool-permission-service.js";
import {
  specialistCapabilitySelectionSchema,
  taskPermissionProfileSchema,
  type Specialist,
  type SpecialistCapabilitySelection,
  type SpecialistPermissionRule,
  type Task,
  type TaskPermissionProfile,
} from "@cc/shared/schemas";
import {
  createCcManagedMcpServerRegistry,
  type CcManagedMcpServerDefinition,
} from "../mcp/cc-managed/server-registry.js";
import { buildCcManagedToolPermissionPattern } from "../mcp/cc-managed/tool-access-service.js";
import type { CustomToolService } from "./custom-tool-service.js";
import type { OpenCodeService } from "./opencode-service.js";
import { createCustomToolService } from "./custom-tool-service.js";
import type { AppDb } from "../db/client.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";

export type TaskPermissionDiagnostic = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type EffectiveTaskPermissions = TaskPermissionProfile & {
  diagnostics: TaskPermissionDiagnostic[];
};

export type OpenCodePermissionRule = SpecialistPermissionRule & {
  permission: string;
};

export type TaskPermissionService = ReturnType<typeof createTaskPermissionService>;

export function createTaskPermissionService(options: {
  db: AppDb;
  config: RuntimeConfig;
  opencodeService: Pick<OpenCodeService, "dispose">;
  customToolService?: CustomToolService;
  mcpTools?: McpToolPermissionService;
  initializeMcpTools?: (directory: string) => Promise<unknown>;
}) {
  const registry = createCcManagedMcpServerRegistry({
    customToolService:
      options.customToolService ??
      createCustomToolService({
        db: options.db,
        config: options.config,
        opencodeService: options.opencodeService,
      }),
  });

  return {
    async compute(task: Task): Promise<EffectiveTaskPermissions> {
      const agent = await loadAgent(task.agentId);
      const merged = mergeTaskPermissions(agent.capabilities, task.permissionProfile);
      const { appMcpServers, appToolPermissions, diagnostics } = filterAppToolsForTaskRun(
        merged,
        registry,
        task.permissionProfile?.appToolPermissions !== undefined,
      );
      await options.initializeMcpTools?.(
        join(options.config.paths.subdirectories.specialists, agent.slug),
      );
      const catalog = await options.mcpTools?.catalog(task.agentId);
      const mcpToolPermissions = catalog?.flatMap((server) =>
        server.available
          ? server.tools.map((tool) => {
              const override = task.permissionProfile?.mcpToolPermissions;
              const exact = override?.find(
                (rule) => rule.server === server.server && rule.tool === tool.name,
              );
              const action =
                exact?.action ??
                (override
                  ? "deny"
                  : resolveMcpToolDefault(
                      { ...agent.capabilities, ...merged },
                      server.server,
                      tool,
                    ));
              return {
                server: server.server,
                tool: tool.name,
                action: action === "ask" ? ("allow" as const) : action,
              };
            })
          : [],
      );
      const normalized = taskPermissionProfileSchema.parse({
        ...merged,
        snapshotVersion: 1,
        ...(mcpToolPermissions ? { mcpToolPermissions } : {}),
        mcpServers: normalizeServerActionsForTask(merged.mcpServers ?? [], diagnostics),
        appMcpServers: normalizeServerActionsForTask(appMcpServers, diagnostics),
        toolPermissions: normalizeRulesForTask(merged.toolPermissions ?? [], diagnostics),
        appToolPermissions: normalizeRulesForTask(appToolPermissions, diagnostics),
        approvalPolicy: "auto_approve",
        diagnostics,
      });

      return {
        ...normalized,
        diagnostics,
      };
    },
  };

  async function loadAgent(agentId: string): Promise<Specialist> {
    const row = await options.db.query.agents.findFirst({
      where: (table, operators) => operators.eq(table.id, agentId),
    });

    if (!row || row.status !== "active") {
      throw new Error("Assigned agent not found for task permission resolution.");
    }

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      role: row.role,
      instructions: row.instructions,
      defaultModel: row.default_model,
      iconPath: row.icon_path ?? undefined,
      workspacePath: "",
      status: row.status,
      capabilities: specialistCapabilitySelectionSchema.parse(JSON.parse(row.capabilities_json)),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      archivedAt: row.archived_at?.toISOString(),
    };
  }
}

export function mergeTaskPermissions(
  agentCapabilities: SpecialistCapabilitySelection,
  taskProfile: TaskPermissionProfile | undefined,
): TaskPermissionProfile {
  return taskPermissionProfileSchema.parse({
    mcpToolPermissions: taskProfile?.mcpToolPermissions ?? agentCapabilities.mcpToolPermissions,
    customTools: taskProfile?.customTools ?? agentCapabilities.customTools,
    mcpServers: taskProfile?.mcpServers ?? agentCapabilities.mcpServers,
    appMcpServers: taskProfile?.appMcpServers ?? agentCapabilities.appMcpServers,
    toolPermissions: taskProfile?.toolPermissions ?? agentCapabilities.toolPermissions,
    appToolPermissions: taskProfile?.appToolPermissions ?? agentCapabilities.appToolPermissions,
    approvalPolicy: taskProfile?.approvalPolicy ?? "inherit",
  });
}

export function buildOpenCodeSessionPermissions(
  permissions: TaskPermissionProfile,
): OpenCodePermissionRule[] {
  return [
    ...(permissions.approvalPolicy === "auto_approve"
      ? [{ permission: "*", pattern: "*", action: "allow" } satisfies OpenCodePermissionRule]
      : []),
    ...(permissions.mcpServers ?? [])
      .filter((server) => server.enabled !== false)
      .map((server) => ({
        permission: `${server.name}_*`,
        pattern: "*",
        action: server.action,
      })),
    ...(permissions.toolPermissions ?? []).map((rule) => ({
      permission: rule.pattern,
      pattern: "*",
      action: rule.action,
    })),
    ...(permissions.appMcpServers ?? []).map((server) => ({
      permission: `${server.name}_*`,
      pattern: "*",
      action: server.action,
    })),
    ...(permissions.appToolPermissions ?? []).map((rule) => ({
      permission: rule.pattern,
      pattern: "*",
      action: rule.action,
    })),
    { permission: "question", pattern: "*", action: "deny" },
    { permission: "plan_enter", pattern: "*", action: "deny" },
    { permission: "plan_exit", pattern: "*", action: "deny" },
  ];
}

function filterAppToolsForTaskRun(
  permissions: TaskPermissionProfile,
  registry: readonly CcManagedMcpServerDefinition[],
  hasToolOverride: boolean,
): {
  appMcpServers: NonNullable<TaskPermissionProfile["appMcpServers"]>;
  appToolPermissions: NonNullable<TaskPermissionProfile["appToolPermissions"]>;
  diagnostics: TaskPermissionDiagnostic[];
} {
  const diagnostics: TaskPermissionDiagnostic[] = [];
  const selectedAppMcpServers = hasToolOverride
    ? registry.map((group) => ({ name: group.name, enabled: true, action: "allow" as const }))
    : (permissions.appMcpServers ?? []);
  const appMcpServers = selectedAppMcpServers.filter((serverSelection) => {
    const server = registry.find((entry) => entry.name === serverSelection.name);

    if (!server) {
      return true;
    }

    const hasTaskTools =
      server.tools.some((tool) => tool.context === "task_run" || tool.context === "both") ||
      server.catalogTools.some((tool) => tool.context === "task_run" || tool.context === "both");

    if (hasTaskTools) {
      return true;
    }

    diagnostics.push({
      code: "chat_only_app_mcp_hidden_from_task_run",
      message: `App MCP server '${server.name}' has no task-run-safe tools and was removed from this task run.`,
      details: { serverName: server.name },
    });
    return false;
  });
  const deniedPatterns = new Set<string>();

  for (const server of registry) {
    for (const tool of server.catalogTools) {
      if (tool.context === "task_run" || tool.context === "both") {
        continue;
      }

      const pattern = buildCcManagedToolPermissionPattern(server.name, tool.name);
      deniedPatterns.add(pattern);
      diagnostics.push({
        code: "chat_only_tool_hidden_from_task_run",
        message: `App tool '${pattern}' is chat-only and was denied for this task run.`,
        details: { serverName: server.name, toolName: tool.name, context: tool.context },
      });
    }
  }

  for (const server of registry) {
    const hasTaskRunTools = server.catalogTools.some(
      (tool) => tool.context === "task_run" || tool.context === "both",
    );

    if (!server.enabledByDefault || !hasTaskRunTools) {
      continue;
    }

    if (!appMcpServers.some((selection) => selection.name === server.name)) {
      appMcpServers.push({ name: server.name, enabled: true, action: "allow" });
    }
  }
  const appToolPermissions = registry.flatMap((group) => {
    const selection = appMcpServers.find((entry) => entry.name === group.name);
    const enabled = selection
      ? selection.enabled !== false && selection.action !== "deny"
      : group.enabledByDefault;
    return group.catalogTools.map((tool) => {
      const pattern = buildCcManagedToolPermissionPattern(group.name, tool.name);
      const inheritedAction = resolveMcpToolDefault(
        {
          toolPermissions: permissions.appToolPermissions,
          mcpServers: selection ? [selection] : [],
        },
        group.name,
        { id: pattern, name: tool.name },
      );
      const rule = permissions.appToolPermissions?.find((entry) => entry.pattern === pattern);
      const action =
        !enabled || deniedPatterns.has(pattern)
          ? ("deny" as const)
          : hasToolOverride
            ? (rule?.action ?? "deny")
            : inheritedAction;
      return { pattern, action };
    });
  });
  return { appMcpServers, appToolPermissions, diagnostics };
}

function normalizeRulesForTask(
  rules: SpecialistPermissionRule[],
  diagnostics: TaskPermissionDiagnostic[],
): SpecialistPermissionRule[] {
  return rules.map((rule) => {
    if (rule.action !== "ask") {
      return rule;
    }

    diagnostics.push({
      code: "ask_mode_not_allowed_for_task_run",
      message: `Permission '${rule.pattern}' used ask mode and was converted to allow for this task run.`,
      details: { pattern: rule.pattern },
    });
    return { ...rule, action: "allow" };
  });
}

function normalizeServerActionsForTask<
  T extends { name: string; action: "allow" | "ask" | "deny" },
>(servers: T[], diagnostics: TaskPermissionDiagnostic[]): T[] {
  return servers.map((server) => {
    if (server.action !== "ask") {
      return server;
    }

    diagnostics.push({
      code: "ask_mode_not_allowed_for_task_run",
      message: `MCP server '${server.name}' used ask mode and was converted to allow for this task run.`,
      details: { serverName: server.name },
    });
    return { ...server, action: "allow" };
  });
}
