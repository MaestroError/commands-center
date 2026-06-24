import {
  addTaskArtifactToolMetadata,
  markNeedsHumanReviewToolMetadata,
  setTaskResultToolMetadata,
} from "../mcp/cc-managed/groups/cc-default/tools/task-run-outcome-tools.js";
import type { SystemPromptRenderContext, SystemPromptVariable } from "./types.js";

/**
 * Source of truth for the `cc_default_*` tools surfaced to prompts. The
 * `cc_default_` prefix matches `TASK_RUN_TOOL_PERMISSION_DENIES` in
 * `opencode/workspace-contract.ts`; descriptions are imported from the tool
 * metadata so the two stay in sync.
 */
const CC_DEFAULT_TOOL_ENTRIES = [
  setTaskResultToolMetadata,
  addTaskArtifactToolMetadata,
  markNeedsHumanReviewToolMetadata,
] as const;

function renderCcDefaultTools(): string {
  return CC_DEFAULT_TOOL_ENTRIES.map(
    (tool) => `- \`cc_default_${tool.name}\` — ${tool.description}`,
  ).join("\n");
}

/**
 * The variable catalog: id → metadata + resolver. Adding a new variable is a
 * one-line change here. Specialist/task resolvers return "" when their context
 * slice is absent so a chat template that references a task var renders empty
 * rather than leaking a placeholder.
 */
export const systemPromptVariables: Record<string, SystemPromptVariable> = {
  APP_NAME: {
    label: "App name",
    description: "The application name (CommandsCenter).",
    resolve: (ctx) => ctx.appName,
  },
  CURRENT_DATE: {
    label: "Current date",
    description: "The server date when the message is sent (ISO-8601).",
    resolve: (ctx) => ctx.currentDate,
  },
  WORKSPACE_DIR: {
    label: "Workspace directory",
    description: "Absolute path to the active workspace directory.",
    resolve: (ctx) => ctx.workspaceDir,
  },
  CONVERSATION_ID: {
    label: "Conversation ID",
    description: "The current conversation id.",
    resolve: (ctx) => ctx.conversationId ?? "",
  },
  SPECIALIST_NAME: {
    label: "Specialist name",
    description: "Display name of the specialist handling the conversation.",
    resolve: (ctx) => ctx.specialist?.name ?? "",
  },
  SPECIALIST_SLUG: {
    label: "Specialist slug",
    description: "URL-safe slug of the specialist.",
    resolve: (ctx) => ctx.specialist?.slug ?? "",
  },
  SPECIALIST_ROLE: {
    label: "Specialist role",
    description: "The specialist's configured role.",
    resolve: (ctx) => ctx.specialist?.role ?? "",
  },
  SPECIALIST_INSTRUCTIONS: {
    label: "Specialist instructions",
    description: "The specialist's configured instructions.",
    resolve: (ctx) => ctx.specialist?.instructions ?? "",
  },
  CC_DEFAULT_TOOLS: {
    label: "CC default tools",
    description: "Bulleted list of the cc_default_* tools and what they do.",
    resolve: () => renderCcDefaultTools(),
  },
  TASK_ID: {
    label: "Task ID",
    description: "The task id (empty outside task runs).",
    resolve: (ctx) => ctx.task?.id ?? "",
  },
  TASK_TITLE: {
    label: "Task title",
    description: "The task title (empty outside task runs).",
    resolve: (ctx) => ctx.task?.title ?? "",
  },
  TASK_RUN_ID: {
    label: "Task run ID",
    description: "The task run id (empty outside task runs).",
    resolve: (ctx) => ctx.task?.runId ?? "",
  },
};

export function hasVariable(id: string): boolean {
  return Object.hasOwn(systemPromptVariables, id);
}

export function getVariableMeta(
  id: string,
): { id: string; label: string; description: string } | undefined {
  const variable = systemPromptVariables[id];
  if (!variable) {
    return undefined;
  }
  return { id, label: variable.label, description: variable.description };
}

export function listVariables(): Array<{ id: string; label: string; description: string }> {
  return Object.entries(systemPromptVariables).map(([id, variable]) => ({
    id,
    label: variable.label,
    description: variable.description,
  }));
}

export function resolveVariable(id: string, ctx: SystemPromptRenderContext): string | undefined {
  return systemPromptVariables[id]?.resolve(ctx);
}
