// Canonical catalog of API-token capabilities. Single source of truth shared by
// the backend (enforcement + validation) and the frontend (token create/edit UI).
//
// A "capability" is one permissionable unit. It is surface-agnostic: the same id
// governs both the REST public endpoint and (from Phase 2 on) the matching public
// MCP tool. Capability ids are plain strings validated against this catalog at
// runtime — deliberately NOT a Zod enum — so later phases can add MCP-served
// capabilities without a schema/migration churn.
//
// A "group" is both a display grouping and a named preset (an id-list a checkbox
// bulk-selects). Presets may overlap: the `tasks` preset intentionally includes
// `list_task_templates` (preserving the pre-capability `either` behavior) even
// though that capability displays under the `templates` group.

export const API_TOKEN_CAPABILITY_GROUPS = ["templates", "tasks", "documents"] as const;

export type ApiTokenCapabilityGroup = (typeof API_TOKEN_CAPABILITY_GROUPS)[number];

export interface ApiTokenCapability {
  /** Stable identifier, e.g. "trigger_task_template". Never reused/renamed. */
  id: string;
  /** Display grouping. */
  group: ApiTokenCapabilityGroup;
  /** Short UI label. */
  label: string;
  /** One-line UI description. */
  description: string;
}

// Ordered templates-group first, then tasks-group, for deterministic display and
// stable badges/tests.
export const API_TOKEN_CAPABILITIES: readonly ApiTokenCapability[] = [
  {
    id: "list_task_templates",
    group: "templates",
    label: "List templates",
    description: "List task templates available to trigger.",
  },
  {
    id: "trigger_task_template",
    group: "templates",
    label: "Trigger template",
    description: "Trigger a task template to create and run a task.",
  },
  {
    id: "get_task_run",
    group: "templates",
    label: "Get template run status",
    description: "Poll the status and result of a template-triggered run.",
  },
  {
    id: "enable_task_template",
    group: "tasks",
    label: "Enable template",
    description: "Activate a task template so it runs on schedule and accepts triggers.",
  },
  {
    id: "disable_task_template",
    group: "tasks",
    label: "Disable template",
    description: "Deactivate a task template without changing its schedule.",
  },
  {
    id: "list_specialists",
    group: "tasks",
    label: "List specialists",
    description: "List specialists so a task can target one.",
  },
  {
    id: "create_task",
    group: "tasks",
    label: "Create task",
    description: "Create a task against a specialist.",
  },
  {
    id: "list_tasks",
    group: "tasks",
    label: "List tasks",
    description: "List workspace tasks by status or source template.",
  },
  {
    id: "get_task",
    group: "tasks",
    label: "Get task",
    description: "Get a single task, optionally with its runs and feedback.",
  },
  {
    id: "trigger_task",
    group: "tasks",
    label: "Trigger task",
    description: "Run an existing task now.",
  },
  {
    id: "schedule_task",
    group: "tasks",
    label: "Schedule task",
    description: "Schedule or reschedule a task for a future time.",
  },
  {
    id: "list_task_runs",
    group: "tasks",
    label: "List task runs",
    description: "List the runs of a task.",
  },
  {
    id: "get_task_run_detail",
    group: "tasks",
    label: "Get task run",
    description: "Get a single run of a task.",
  },
  {
    id: "list_task_feedback",
    group: "tasks",
    label: "List task feedback",
    description: "Read a task's feedback threads and subtask replies.",
  },
  {
    id: "list_documents",
    group: "documents",
    label: "List documents",
    description: "List documents available to this token.",
  },
  {
    id: "search_documents",
    group: "documents",
    label: "Search documents",
    description: "Search document metadata and markdown content.",
  },
  {
    id: "read_document",
    group: "documents",
    label: "Read document",
    description: "Read a specific document.",
  },
] as const;

const CAPABILITY_ID_SET: ReadonlySet<string> = new Set(
  API_TOKEN_CAPABILITIES.map((capability) => capability.id),
);

// Named, possibly-overlapping id-lists a group checkbox bulk-selects. The `tasks`
// preset includes `list_task_templates` on purpose (old `either` behavior).
export const API_TOKEN_PRESETS: Record<ApiTokenCapabilityGroup, readonly string[]> = {
  templates: ["list_task_templates", "trigger_task_template", "get_task_run"],
  tasks: [
    "list_task_templates",
    "enable_task_template",
    "disable_task_template",
    "list_specialists",
    "create_task",
    "list_tasks",
    "get_task",
    "trigger_task",
    "schedule_task",
    "list_task_runs",
    "get_task_run_detail",
    "list_task_feedback",
  ],
  documents: ["list_documents", "search_documents", "read_document"],
};

export function isApiTokenCapabilityId(id: string): boolean {
  return CAPABILITY_ID_SET.has(id);
}

/** Capability ids kept in catalog order, filtered to those that exist. */
export function orderApiTokenCapabilityIds(ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  return API_TOKEN_CAPABILITIES.filter((capability) => wanted.has(capability.id)).map(
    (capability) => capability.id,
  );
}
