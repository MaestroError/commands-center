import { z } from "zod";

// Per-template MCP tool configuration. Stored in `task_templates.mcp_config_json`
// (file-mirrored in the template's workspace JSON) and consumed by the public MCP
// server to expose each template as a tool.

export const MCP_TOOL_NAME_MAX_LENGTH = 64;

// MCP-safe identifier: lowercase, starts with a letter, then letters/digits/_.
export const mcpToolNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MCP_TOOL_NAME_MAX_LENGTH)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "Tool name must be lowercase and start with a letter (letters, digits, underscores).",
  );

// Static core tool names served by the public MCP registry (Phase 2). Template
// tool names may not collide with these. Kept here as the single source of truth
// so the backend registry (asserted in a test) and the save-time validator agree.
export const RESERVED_MCP_TOOL_NAMES: readonly string[] = [
  "list_task_templates",
  "task_template_run",
  "enable_task_template",
  "disable_task_template",
  "list_specialists",
  "create_task",
  "list_tasks",
  "get_task",
  "task_run",
  "schedule_task",
  "list_task_runs",
  "get_task_run",
  "get_task_result",
  "list_task_feedback",
  "list_documents",
  "search_documents",
  "read_document",
  "create_document",
  // Auto-exposed async variants (Phase 4). Also covered by the `_async` suffix
  // rule below, but listed explicitly for a complete reserved surface.
  "task_run_async",
  "task_template_run_async",
];

const RESERVED_SET = new Set(RESERVED_MCP_TOOL_NAMES);

// The `_async` suffix is owned by the Phase 4 async-variant derivation, so a
// template tool may never take a name ending in it.
export function isReservedMcpToolName(name: string): boolean {
  return RESERVED_SET.has(name) || name.endsWith("_async");
}

/** Derive a default MCP-safe tool name from a template title. */
export function deriveMcpToolName(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const withLeadingLetter = /^[a-z]/.test(base) ? base : `t_${base}`;
  const capped = withLeadingLetter.slice(0, MCP_TOOL_NAME_MAX_LENGTH).replace(/_+$/g, "");
  return capped.length > 0 ? capped : "tool";
}

const artifactUrlTogglesSchema = z.object({
  displayableUrlEnabled: z.boolean().default(true),
  downloadableUrlEnabled: z.boolean().default(true),
});

const resolvedTaskTemplateMcpConfigSchema = z.object({
  syncEnabled: z.boolean().default(true),
  toolName: mcpToolNameSchema,
  toolDescription: z.string().trim().default(""),
  textFieldDescription: z.string().trim().default(""),
  allowFiles: z.boolean().default(true),
  filesFieldDescription: z.string().trim().default(""),
  asyncEnabled: z.boolean().default(false),
  asyncAlwaysAcknowledge: z.boolean().default(false),
  // Scaffold; consumed in Phase 6 (displayable/downloadable artifact URLs).
  artifacts: artifactUrlTogglesSchema.default({
    displayableUrlEnabled: true,
    downloadableUrlEnabled: true,
  }),
});

// Stored/output shape: fully resolved, toolName required. The preprocessor
// preserves the effective behavior of portable workspace files written before
// sync and async tool exposure became independent.
export const taskTemplateMcpConfigSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (record["syncEnabled"] !== undefined || record["exposeAsTool"] === undefined) {
    return value;
  }

  const legacyExposed = record["exposeAsTool"] === true;
  return {
    ...record,
    syncEnabled: legacyExposed,
    asyncEnabled: legacyExposed && record["asyncEnabled"] === true,
  };
}, resolvedTaskTemplateMcpConfigSchema);

// Input shape: every field optional, so create/edit can send a partial config
// and the service merges it over derived defaults / the existing config.
export const taskTemplateMcpConfigInputSchema = z.object({
  syncEnabled: z.boolean().optional(),
  // Accepted for existing API clients. New writes use syncEnabled.
  exposeAsTool: z.boolean().optional(),
  toolName: z.string().trim().optional(),
  toolDescription: z.string().trim().optional(),
  textFieldDescription: z.string().trim().optional(),
  allowFiles: z.boolean().optional(),
  filesFieldDescription: z.string().trim().optional(),
  asyncEnabled: z.boolean().optional(),
  asyncAlwaysAcknowledge: z.boolean().optional(),
  artifacts: z
    .object({
      displayableUrlEnabled: z.boolean().optional(),
      downloadableUrlEnabled: z.boolean().optional(),
    })
    .optional(),
});

export type TaskTemplateMcpConfig = z.infer<typeof taskTemplateMcpConfigSchema>;
export type TaskTemplateMcpConfigInput = z.input<typeof taskTemplateMcpConfigInputSchema>;
