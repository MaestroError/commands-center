import {
  specialistCapabilitySelectionSchema,
  type Specialist,
  type SpecialistCapabilitySelection,
} from "../schemas/specialists.js";

import {
  taskPermissionProfileSchema,
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
  opencodeService: OpenCodeService;
  customToolService?: CustomToolService;
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
      );
      const normalized = taskPermissionProfileSchema.parse({
        ...merged,
        appMcpServers,
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
    { permission: "question", pattern: "*", action: "deny" },
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
  ];
}

function filterAppToolsForTaskRun(
  permissions: TaskPermissionProfile,
  registry: readonly CcManagedMcpServerDefinition[],
): {
  appMcpServers: NonNullable<TaskPermissionProfile["appMcpServers"]>;
  appToolPermissions: NonNullable<TaskPermissionProfile["appToolPermissions"]>;
  diagnostics: TaskPermissionDiagnostic[];
} {
  const diagnostics: TaskPermissionDiagnostic[] = [];
  const selectedAppMcpServers = permissions.appMcpServers ?? [];
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
  const autoAllowedTaskRunPatterns = new Set<string>();

  for (const server of registry) {
    for (const tool of server.catalogTools) {
      if (tool.context === "task_run" || tool.context === "both") {
        if (server.enabledByDefault) {
          autoAllowedTaskRunPatterns.add(
            buildCcManagedToolPermissionPattern(server.name, tool.name),
          );
        }
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
  const appToolPermissions = (permissions.appToolPermissions ?? []).filter(
    (rule) => !deniedPatterns.has(rule.pattern),
  );
  const existingPatterns = new Set(appToolPermissions.map((rule) => rule.pattern));

  return {
    appMcpServers,
    appToolPermissions: [
      ...appToolPermissions,
      ...[...autoAllowedTaskRunPatterns]
        .filter((pattern) => !existingPatterns.has(pattern))
        .map((pattern) => ({ pattern, action: "allow" as const })),
      ...[...deniedPatterns].map((pattern) => ({ pattern, action: "deny" as const })),
    ],
    diagnostics,
  };
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
