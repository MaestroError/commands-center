// Split out of TasksPage.tsx (issue #99).

import {
  buildArtifactHref,
  formatDate,
  formatRepeatSummary,
  formatToken,
  formatWeekday,
} from "@/components/tasks/task-format";
import {
  buildTaskPromptText,
  createTaskPromptValue,
  type TaskPromptValue,
} from "@/components/tasks/task-prompt";
import { buildFileManagerHref } from "@/lib/file-manager-href";
import {
  isTaskCreationPrefill,
  type TaskCreationPrefill,
  type TaskTemplateCreationPrefill,
} from "@/services/task-prefill-service";

export type { TaskTemplateCreationPrefill };
import {
  MAX_FALLBACK_MODELS,
  recurringTaskScheduleSchema,
  type BoardTaskStatus,
  type Artifact,
  type CreateTaskInput,
  type CreateTaskTemplateInput,
  type Specialist,
  type SpecialistCatalog,
  type Task,
  type TaskRepeatRule,
  type TaskRun,
  type TaskSchedulerState,
  type TaskSubtaskProgress,
  type TaskTemplate,
  type UpdateTaskInput,
} from "@cc/shared/schemas";
import { useEffect, useMemo, useState } from "react";

export type TasksPageProps = {
  mode?: "list" | "create" | "edit" | "template-create" | "template-edit";
};

export type DetailSectionId = "overview" | "subtasks" | "runs";

export const TASK_VIEWS = ["board", "templates", "archive"] as const;

export const DETAIL_SECTION_TABS = [
  { id: "overview", label: "Overview" },
  { id: "subtasks", label: "Subtasks" },
  { id: "runs", label: "Runs" },
];

export const BOARD_COLUMNS = [
  {
    status: "backlog",
    title: "Backlog",
    description: "Tasks that exist but are not scheduled, queued, ready, under review, or done.",
    empty: "New unscheduled tasks appear here before they enter active work.",
  },
  {
    status: "scheduled",
    title: "Scheduled",
    description: "Tasks that should enter execution later or carry timing priority.",
    empty: "Scheduled tasks will queue automatically when their time arrives.",
  },
  {
    status: "queued",
    title: "Queued",
    description: "Tasks with queued or running AI work.",
    empty: "Queued and running work appears here while the specialist is active.",
  },
  {
    status: "failed",
    title: "Failed",
    description: "Runs the system stopped due to errors, or after exhausting automatic retries.",
    empty: "Failed runs appear here when the system cannot complete them.",
  },
  {
    status: "review",
    title: "Review",
    description: "Tasks a specialist or you flagged for a human decision or feedback.",
    empty: "Human-review requests appear here.",
  },
  {
    status: "ready_to_check",
    title: "Ready to Check",
    description: "AI work finished successfully and is waiting for acceptance.",
    empty: "Completed AI runs appear here for review before acceptance.",
  },
  {
    status: "done",
    title: "Done",
    description: "Tasks explicitly accepted by the operator.",
    empty: "Accepted work stays here until archival.",
  },
] satisfies Array<{
  status: BoardTaskStatus;
  title: string;
  description: string;
  empty: string;
}>;

export const FILTER_SUGGESTIONS = [
  "backlog",
  "scheduled",
  "queued",
  "failed",
  "review",
  "ready to check",
  "done",
  "archived",
  "template",
  "manual template",
  "repeating",
  "generated",
] as const;

export const REPEAT_PRESETS = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "weekday",
  "custom",
] as const;

export const REPEAT_FREQUENCIES = ["hour", "day", "week", "month", "year"] as const;

export const WEEKDAYS = [
  { value: 0, label: formatWeekday(0) ?? "Sun" },
  { value: 1, label: formatWeekday(1) ?? "Mon" },
  { value: 2, label: formatWeekday(2) ?? "Tue" },
  { value: 3, label: formatWeekday(3) ?? "Wed" },
  { value: 4, label: formatWeekday(4) ?? "Thu" },
  { value: 5, label: formatWeekday(5) ?? "Fri" },
  { value: 6, label: formatWeekday(6) ?? "Sat" },
] as const;

export type TaskCardIconActionVariant = "normal" | "success" | "warning" | "danger";

export function taskCardActionTestId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `task-card-action-${slug}`;
}

export function formatTodoItemsText(task: Task): string {
  return task.todos.map((todo) => todo.content).join("\n");
}

export function buildTaskTodoInputs(
  text: string,
  task: Task,
): NonNullable<UpdateTaskInput["todos"]> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((content, index) => {
      const existing = task.todos[index];

      if (!existing) {
        return { content };
      }

      const input: NonNullable<UpdateTaskInput["todos"]>[number] = {
        id: existing.id,
        content,
        status: existing.status,
        createdAt: existing.createdAt,
      };

      if (existing.completedAt) {
        input.completedAt = existing.completedAt;
      }

      return input;
    });
}

export function usePersistentTaskContextOpen(
  taskId: string,
): readonly [boolean, (value: boolean | ((current: boolean) => boolean)) => void] {
  return usePersistentTaskSectionOpen(taskId, "context", false);
}

export function usePersistentTaskSectionOpen(
  taskId: string,
  section: "context" | "todos",
  defaultOpen: boolean,
): readonly [boolean, (value: boolean | ((current: boolean) => boolean)) => void] {
  const storageKey = `cc-task-${section}-expanded:${taskId}`;
  const [isOpen, setIsOpen] = useState(() => readStoredTaskSectionOpen(storageKey, defaultOpen));

  useEffect(() => {
    setIsOpen(readStoredTaskSectionOpen(storageKey, defaultOpen));
  }, [defaultOpen, storageKey]);

  function updateIsOpen(value: boolean | ((current: boolean) => boolean)) {
    setIsOpen((current) => {
      const nextValue = typeof value === "function" ? value(current) : value;

      try {
        localStorage.setItem(storageKey, nextValue ? "true" : "false");
      } catch {
        return nextValue;
      }

      return nextValue;
    });
  }

  return [isOpen, updateIsOpen] as const;
}

function readStoredTaskSectionOpen(storageKey: string, defaultOpen: boolean): boolean {
  try {
    const storedValue = localStorage.getItem(storageKey);
    return storedValue === null ? defaultOpen : storedValue === "true";
  } catch {
    return defaultOpen;
  }
}

export function formatTaskContextSummary(task: Task): string {
  const text = task.context.text?.trim();
  const attachmentCount = task.context.attachments.length;

  if (!text && attachmentCount === 0) {
    return "No persistent context.";
  }

  const textSummary = text ? (text.length > 90 ? `${text.slice(0, 90)}...` : text) : "No text";
  const attachmentSummary =
    attachmentCount === 0
      ? "no attachments"
      : `${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`;

  return `${textSummary} · ${attachmentSummary}`;
}

export type FormState = {
  agentId: string;
  /** Optional qualified `provider/model` override; empty = use the specialist default. */
  model: string;
  fallbackModels: string[];
  title: string;
  prompt: TaskPromptValue;
  scheduledAtLocal: string;
  dueAtLocal: string;
  anchorAtLocal: string;
  timezone: string;
  repeatPreset: RepeatPreset;
  repeatFrequency: RepeatFrequency;
  repeatInterval: string;
  repeatWeekdays: number[];
  repeatEnabled: boolean;
  /** Template "Active" status. Tasks ignore this field. */
  enabled: boolean;
  todosText: string;
  // MCP tool config (templates only; tasks ignore these).
  mcpExposeAsTool: boolean;
  mcpToolName: string;
  mcpToolDescription: string;
  mcpTextFieldDescription: string;
  mcpAllowFiles: boolean;
  mcpFilesFieldDescription: string;
  mcpAsyncEnabled: boolean;
  mcpDisplayableUrlEnabled: boolean;
  mcpDownloadableUrlEnabled: boolean;
};

const DEFAULT_MCP_FORM_FIELDS = {
  mcpExposeAsTool: true,
  mcpToolName: "",
  mcpToolDescription: "",
  mcpTextFieldDescription: "",
  mcpAllowFiles: true,
  mcpFilesFieldDescription: "",
  mcpAsyncEnabled: false,
  mcpDisplayableUrlEnabled: true,
  mcpDownloadableUrlEnabled: true,
} as const;

export type RepeatPreset = (typeof REPEAT_PRESETS)[number];

export type RepeatFrequency = (typeof REPEAT_FREQUENCIES)[number];

export type TaskView = (typeof TASK_VIEWS)[number];

export function taskToForm(task?: Task, prefill?: TaskCreationPrefill): FormState {
  return {
    agentId: task?.agentId ?? prefill?.agentId ?? "",
    model: task?.model ?? "",
    fallbackModels: task?.fallbackModels ?? [],
    title: task?.title ?? prefill?.title ?? "",
    prompt: task
      ? createTaskPromptValue(task.description)
      : (prefill?.prompt ?? createTaskPromptValue()),
    scheduledAtLocal: task?.scheduledAt ? toLocalDateTime(task.scheduledAt) : "",
    dueAtLocal: task?.dueAt ? toLocalDateTime(task.dueAt) : "",
    anchorAtLocal: "",
    timezone: readLocalTimezone(),
    repeatPreset: "hourly",
    repeatFrequency: "hour",
    repeatInterval: "1",
    repeatWeekdays: [],
    repeatEnabled: false,
    enabled: task?.enabled ?? true,
    todosText: task?.todos.map((todo) => todo.content).join("\n") ?? "",
    ...DEFAULT_MCP_FORM_FIELDS,
  };
}

export function templateToForm(
  template?: TaskTemplate,
  prefill?: TaskTemplateCreationPrefill,
): FormState {
  const recurrence = template?.recurrence ?? prefill?.recurrence ?? undefined;
  const repeatRule = recurrence?.repeatRule;
  const repeatFrequency = repeatRule?.frequency ?? "week";

  return {
    agentId: template?.defaultAgentId ?? prefill?.defaultAgentId ?? "",
    model: template?.model ?? "",
    fallbackModels: template?.fallbackModels ?? [],
    title: template?.title ?? prefill?.title ?? "",
    prompt: createTaskPromptValue(template?.description ?? prefill?.description ?? ""),
    scheduledAtLocal: "",
    dueAtLocal: "",
    anchorAtLocal: recurrence?.anchorAt
      ? toLocalDateTime(recurrence.anchorAt)
      : toLocalDateTime(new Date().toISOString()),
    timezone: recurrence?.timezone ?? readLocalTimezone(),
    repeatPreset: readRepeatPreset(repeatRule),
    repeatFrequency,
    repeatInterval: String(repeatRule?.interval ?? 1),
    repeatWeekdays: repeatRule?.weekdays ?? (repeatFrequency === "week" ? [1] : []),
    repeatEnabled: Boolean(recurrence),
    enabled: template?.enabled ?? true,
    todosText: template?.todos.map((todo) => todo.content).join("\n") ?? "",
    mcpExposeAsTool: template?.mcpConfig.exposeAsTool ?? true,
    mcpToolName: template?.mcpConfig.toolName ?? "",
    mcpToolDescription: template?.mcpConfig.toolDescription ?? "",
    mcpTextFieldDescription: template?.mcpConfig.textFieldDescription ?? "",
    mcpAllowFiles: template?.mcpConfig.allowFiles ?? true,
    mcpFilesFieldDescription: template?.mcpConfig.filesFieldDescription ?? "",
    mcpAsyncEnabled: template?.mcpConfig.asyncEnabled ?? false,
    mcpDisplayableUrlEnabled: template?.mcpConfig.artifacts.displayableUrlEnabled ?? true,
    mcpDownloadableUrlEnabled: template?.mcpConfig.artifacts.downloadableUrlEnabled ?? true,
  };
}

function readRepeatPreset(repeatRule?: TaskRepeatRule): RepeatPreset {
  if (!repeatRule) return "weekly";
  if (repeatRule.frequency === "hour" && repeatRule.interval === 1) return "hourly";
  if (repeatRule.frequency === "day" && repeatRule.interval === 1) return "daily";
  if (repeatRule.frequency === "month" && repeatRule.interval === 1) return "monthly";
  if (repeatRule.frequency === "year" && repeatRule.interval === 1) return "yearly";

  if (repeatRule.frequency === "week" && repeatRule.interval === 1) {
    const weekdays = repeatRule.weekdays ?? [];
    if (weekdays.join(",") === "1,2,3,4,5") return "weekday";
    return "weekly";
  }

  return "custom";
}

export function getTaskCreationPrefill(state: unknown): TaskCreationPrefill | undefined {
  if (!state || typeof state !== "object" || !("taskPrefill" in state)) {
    return undefined;
  }

  const taskPrefill = (state as { taskPrefill: unknown }).taskPrefill;
  return isTaskCreationPrefill(taskPrefill) ? taskPrefill : undefined;
}

export function getTaskTemplateCreationPrefill(
  state: unknown,
): TaskTemplateCreationPrefill | undefined {
  if (!state || typeof state !== "object" || !("templatePrefill" in state)) {
    return undefined;
  }

  const value = (state as { templatePrefill: unknown }).templatePrefill;
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const asStringOrUndefined = (input: unknown) => (typeof input === "string" ? input : undefined);
  if (
    (candidate["defaultAgentId"] !== undefined &&
      typeof candidate["defaultAgentId"] !== "string") ||
    (candidate["title"] !== undefined && typeof candidate["title"] !== "string") ||
    (candidate["description"] !== undefined && typeof candidate["description"] !== "string")
  ) {
    return undefined;
  }

  // Validate recurrence with its schema and drop it if malformed — templateToForm
  // dereferences recurrence.anchorAt/repeatRule, so an unchecked location.state
  // could otherwise crash the template-create page at render time.
  const recurrence = recurringTaskScheduleSchema.safeParse(candidate["recurrence"]);

  return {
    defaultAgentId: asStringOrUndefined(candidate["defaultAgentId"]),
    title: asStringOrUndefined(candidate["title"]),
    description: asStringOrUndefined(candidate["description"]),
    recurrence: recurrence.success ? recurrence.data : undefined,
  };
}

export function formToTaskInput(form: FormState): CreateTaskInput | UpdateTaskInput {
  const description = buildTaskPromptText(form.prompt);
  const input: CreateTaskInput | UpdateTaskInput = {
    agentId: form.agentId,
    model: form.model ? form.model : null,
    fallbackModels: normalizeTaskFallbackModels(form.fallbackModels, form.model),
    title: readTaskTitle(form.title, description),
    description,
    todos: form.todosText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((content) => ({ content })),
    enabled: true,
  };

  if (form.scheduledAtLocal) {
    input.scheduledAt = new Date(form.scheduledAtLocal).toISOString();
  }

  if (form.dueAtLocal) {
    input.dueAt = new Date(form.dueAtLocal).toISOString();
  }

  return input;
}

function readTaskTitle(title: string, description: string): string {
  const trimmedTitle = title.trim();
  if (trimmedTitle) return trimmedTitle;

  const promptTitle = description.trim().slice(0, 50).trim();
  return promptTitle ? `${promptTitle}...` : "Untitled task";
}

export function formToTemplateInput(form: FormState): CreateTaskTemplateInput {
  const input: CreateTaskTemplateInput = {
    defaultAgentId: form.agentId,
    model: form.model ? form.model : null,
    fallbackModels: normalizeTaskFallbackModels(form.fallbackModels, form.model),
    title: form.title,
    description: buildTaskPromptText(form.prompt),
    todos: form.todosText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((content) => ({ content })),
    enabled: form.enabled,
  };

  input.recurrence = form.repeatEnabled
    ? {
        mode: "recurring",
        anchorAt: new Date(form.anchorAtLocal || Date.now()).toISOString(),
        timezone: form.timezone || readLocalTimezone(),
        repeatRule: buildRepeatRule(form),
      }
    : null;

  input.mcpConfig = {
    exposeAsTool: form.mcpExposeAsTool,
    // Empty means "derive from title" server-side.
    toolName: form.mcpToolName.trim() ? form.mcpToolName.trim() : undefined,
    toolDescription: form.mcpToolDescription,
    textFieldDescription: form.mcpTextFieldDescription,
    allowFiles: form.mcpAllowFiles,
    filesFieldDescription: form.mcpFilesFieldDescription,
    asyncEnabled: form.mcpAsyncEnabled,
    artifacts: {
      displayableUrlEnabled: form.mcpDisplayableUrlEnabled,
      downloadableUrlEnabled: form.mcpDownloadableUrlEnabled,
    },
  };

  return input;
}

export function templateAsTask(template: TaskTemplate): Task {
  return {
    id: template.id,
    agentId: template.defaultAgentId,
    defaultAgentId: template.defaultAgentId,
    templateId: template.id,
    model: template.model,
    fallbackModels: template.fallbackModels,
    title: template.title,
    description: template.description,
    context: { attachments: [] },
    todos: template.todos,
    status: "backlog",
    enabled: template.enabled,
    archived: false,
    latestFinalMessage: template.latestFinalMessage,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

export function normalizeTaskFallbackModels(models: string[], primaryModel: string): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  const trimmedPrimary = primaryModel.trim();

  for (const model of models) {
    const trimmed = model.trim();
    if (!trimmed || trimmed === trimmedPrimary || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
    if (normalized.length >= MAX_FALLBACK_MODELS) {
      break;
    }
  }

  return normalized;
}

export function buildTaskContextAttachmentHref(storageKey: string): string {
  return buildFileManagerHref({
    root: "workspace",
    path: `sessions/${storageKey}`,
    openInEditor: true,
  });
}

export function buildRepeatRule(form: FormState): TaskRepeatRule {
  if (form.repeatPreset === "hourly") return { frequency: "hour", interval: 1 };
  if (form.repeatPreset === "daily") return { frequency: "day", interval: 1 };
  if (form.repeatPreset === "monthly") return { frequency: "month", interval: 1 };
  if (form.repeatPreset === "yearly") return { frequency: "year", interval: 1 };
  if (form.repeatPreset === "weekday") {
    return { frequency: "week", interval: 1, weekdays: [1, 2, 3, 4, 5] };
  }

  if (form.repeatPreset === "weekly") {
    return { frequency: "week", interval: 1, weekdays: normalizeWeekdays(form.repeatWeekdays) };
  }

  return {
    frequency: form.repeatFrequency,
    interval: Number.parseInt(form.repeatInterval, 10) || 1,
    weekdays: form.repeatFrequency === "week" ? normalizeWeekdays(form.repeatWeekdays) : undefined,
  };
}

function normalizeWeekdays(values: number[]): number[] {
  return values.length > 0 ? [...new Set(values)].sort((left, right) => left - right) : [1];
}

export function formatRepeatPreset(preset: RepeatPreset): string {
  if (preset === "hourly") return "Every hour";
  if (preset === "weekday") return "Every weekday";
  return preset === "custom" ? "Custom" : formatToken(preset);
}

export function readTaskView(params: URLSearchParams): TaskView {
  const view = params.get("view");
  return TASK_VIEWS.includes(view as TaskView) ? (view as TaskView) : "board";
}

export function setTaskView(
  params: URLSearchParams,
  setSearchParams: (params: URLSearchParams) => void,
  view: TaskView,
) {
  const next = new URLSearchParams(params);
  if (view === "board") next.delete("view");
  else next.set("view", view);
  setSearchParams(next);
}

export function setSelectedTask(
  params: URLSearchParams,
  setSearchParams: (params: URLSearchParams) => void,
  taskId: string,
) {
  const next = new URLSearchParams(params);
  next.set("task", taskId);
  setSearchParams(next);
}

export function clearSelectedTask(
  params: URLSearchParams,
  setSearchParams: (params: URLSearchParams) => void,
) {
  const next = new URLSearchParams(params);
  next.delete("task");
  setSearchParams(next);
}

export function setSelectedTemplate(
  params: URLSearchParams,
  setSearchParams: (params: URLSearchParams) => void,
  templateId: string,
) {
  const next = new URLSearchParams(params);
  next.set("view", "templates");
  next.delete("task");
  next.set("template", templateId);
  setSearchParams(next);
}

export function clearSelectedTemplate(
  params: URLSearchParams,
  setSearchParams: (params: URLSearchParams) => void,
) {
  const next = new URLSearchParams(params);
  next.delete("template");
  setSearchParams(next);
}

export function selectGeneratedTask(
  params: URLSearchParams,
  setSearchParams: (params: URLSearchParams) => void,
  taskId: string,
) {
  const next = new URLSearchParams(params);
  next.delete("view");
  next.delete("template");
  next.set("task", taskId);
  setSearchParams(next);
}

export function buildPanelSearch(currentSearch: string, taskId: string): string {
  const params = new URLSearchParams(
    currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch,
  );
  params.set("task", taskId);
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function buildFullPageSearch(currentSearch: string): string {
  const params = new URLSearchParams(
    currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch,
  );
  params.delete("task");
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function formatTaskView(view: TaskView): string {
  if (view === "board") return "Board";
  if (view === "templates") return "Templates";
  return "Archive";
}

export function readBoardStatus(task: Task): BoardTaskStatus {
  return BOARD_COLUMNS.some((column) => column.status === task.status)
    ? (task.status as BoardTaskStatus)
    : "backlog";
}

export function filterTasks(tasks: Task[], agents: Specialist[], filterText: string): Task[] {
  const query = normalizeFilterText(filterText);

  if (!query) {
    return tasks;
  }

  return tasks.filter((task) => buildTaskFilterText(task, agents).includes(query));
}

export function filterTemplates(
  templates: TaskTemplate[],
  agents: Specialist[],
  filterText: string,
): TaskTemplate[] {
  const query = normalizeFilterText(filterText);

  if (!query) {
    return templates;
  }

  return templates.filter((template) => buildTemplateFilterText(template, agents).includes(query));
}

function buildTaskFilterText(task: Task, agents: Specialist[]): string {
  const status = readBoardStatus(task);
  const agent = agents.find((entry) => entry.id === task.agentId);
  const values = [
    task.title,
    task.description,
    task.agentId,
    agent?.name,
    status,
    formatToken(status),
    task.archived ? "archived" : undefined,
    task.sourceTemplateId ? "generated template" : undefined,
    task.scheduledAt || task.scheduledFor ? "scheduled" : undefined,
    task.dueAt ? "due" : undefined,
    task.latestFinalMessage,
    ...task.todos.map((todo) => todo.content),
  ];

  return normalizeFilterText(values.filter(Boolean).join(" "));
}

function buildTemplateFilterText(template: TaskTemplate, agents: Specialist[]): string {
  const agent = agents.find((entry) => entry.id === template.defaultAgentId);
  const values = [
    template.title,
    template.description,
    template.defaultAgentId,
    agent?.name,
    "template",
    template.recurrence ? "repeating recurring scheduled" : "manual template",
    formatTemplateRepeat(template),
    template.enabled ? "enabled" : "disabled",
    template.latestTaskId ? "generated latest task" : undefined,
    ...template.todos.map((todo) => todo.content),
  ];

  return normalizeFilterText(values.filter(Boolean).join(" "));
}

function normalizeFilterText(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, " ");
}

export function readAgentName(agents: Specialist[], agentId: string): string {
  return agents.find((agent) => agent.id === agentId)?.name ?? agentId;
}

export function readCardClassName(status: BoardTaskStatus, draggable: boolean): string {
  const emphasis =
    status === "ready_to_check"
      ? "border-accent/40 bg-accent/5"
      : status === "review"
        ? "border-amber-400/40 bg-amber-400/5"
        : status === "failed"
          ? "border-red-400/40 bg-red-400/5"
          : status === "queued"
            ? "border-accent/30 bg-surface-elevated"
            : "border-border bg-surface";
  const interaction = draggable
    ? "cursor-grab hover:-translate-y-1 hover:shadow-lg active:cursor-grabbing active:shadow-xl"
    : "cursor-default";

  return `group/card grid min-w-0 max-w-full gap-3 rounded-xl border p-4 transition duration-150 ease-out ${interaction} ${emphasis}`;
}

export function readColumnClassName(
  draggedTask: Task | undefined,
  status: BoardTaskStatus,
  activeRuns: TaskRun[],
  isDragOver: boolean,
): string {
  const base =
    "cc-panel flex min-h-80 w-80 min-w-0 shrink-0 flex-col gap-3 border-2 p-4 transition duration-150 ease-out";

  if (!draggedTask) return base;

  const canDrop = canDropTaskOnStatus(draggedTask, status, activeRuns);

  if (!canDrop) return `${base} border-border opacity-60`;

  return isDragOver
    ? `${base} border-solid border-accent bg-accent/10 shadow-lg shadow-accent/10`
    : `${base} border-dotted border-accent/80 bg-accent/5 shadow-sm`;
}

export function readColumnDropState(
  draggedTask: Task | undefined,
  status: BoardTaskStatus,
  activeRuns: TaskRun[],
  isDragOver: boolean,
): "idle" | "ready" | "active" | "blocked" {
  if (!draggedTask) return "idle";

  return canDropTaskOnStatus(draggedTask, status, activeRuns)
    ? isDragOver
      ? "active"
      : "ready"
    : "blocked";
}

export function canDropTaskOnStatus(
  task: Task,
  status: BoardTaskStatus,
  activeRuns: TaskRun[],
): boolean {
  const currentStatus = readBoardStatus(task);

  if (currentStatus === status) return false;
  if (activeRuns.some((run) => run.taskId === task.id) || currentStatus === "queued") return false;
  if (status === "done") return currentStatus === "ready_to_check" || currentStatus === "review";
  return status !== "archived";
}

export function hasUsableScheduledAt(task: Task, schedulerState?: TaskSchedulerState): boolean {
  const scheduledAt = task.scheduledAt ?? task.scheduledFor;

  return Boolean(scheduledAt && !isConsumedScheduledAt(scheduledAt, schedulerState));
}

export function isConsumedScheduledAt(
  scheduledAt: string,
  schedulerState?: TaskSchedulerState,
): boolean {
  return Boolean(
    schedulerState?.lastScheduledAt &&
    new Date(scheduledAt).getTime() <= new Date(schedulerState.lastScheduledAt).getTime(),
  );
}

export function readTaskCardIconActionClassName(
  variant: TaskCardIconActionVariant = "normal",
): string {
  const emphasis =
    variant === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:border-emerald-500/60 hover:bg-emerald-500/15 dark:text-emerald-400"
      : variant === "warning"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-600 hover:border-amber-500/60 hover:bg-amber-500/15 dark:text-amber-400"
        : variant === "danger"
          ? "border-red-500/30 bg-red-500/10 text-red-600 hover:border-red-500/60 hover:bg-red-500/15 dark:text-red-400"
          : "border-border bg-surface-elevated text-text-secondary hover:border-accent/50 hover:text-accent";

  return `group relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 ${emphasis}`;
}

export function formatResultMessagePreview(message: string): string {
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}

export function formatSubtaskPreview(description: string): string {
  return description.length > 100 ? `${description.slice(0, 100)}...` : description;
}

export function formatSubtaskDotLabel(description: string): string {
  return `Subtask: ${formatSubtaskPreview(description) || "No description"}`;
}

export function readSubtaskDotClassName(
  status: TaskSubtaskProgress["subtasks"][number]["status"],
): string {
  const color =
    status === "done"
      ? "border-emerald-500 bg-emerald-500"
      : status === "failed"
        ? "border-red-500 bg-red-500"
        : status === "review"
          ? "border-amber-500 bg-amber-500"
          : "border-accent bg-accent";

  return `block h-3 w-3 rounded-full border-2 ring-2 ring-surface ${color}`;
}

// Blueish, rounded result box matching the "Latest update" treatment.

export const RESULT_BOX_CLASS =
  "min-w-0 break-words [overflow-wrap:anywhere] rounded-lg border border-accent/30 bg-accent/10 p-3 text-text-primary";

/** Renders text clamped to ~3 lines (with an ellipsis); optionally click-to-expand. */

export function readResultClassName(status: BoardTaskStatus): string {
  const emphasis =
    status === "ready_to_check"
      ? "border-accent/30 bg-accent/10 text-text-primary"
      : status === "review"
        ? "border-amber-400/30 bg-amber-400/10 text-text-primary"
        : status === "failed"
          ? "border-red-400/30 bg-red-400/10 text-text-primary"
          : "border-border bg-background text-text-secondary";

  return `min-w-0 break-words [overflow-wrap:anywhere] rounded-lg border p-3 text-sm leading-6 ${emphasis}`;
}

export function readLatestRunResult(
  runs: TaskRun[],
): { content: string; run: TaskRun } | undefined {
  const [latestRun] = runs;
  const content = latestRun
    ? (latestRun.finalMessage ?? latestRun.resultText ?? latestRun.errorMessage)
    : undefined;

  return latestRun && content ? { content, run: latestRun } : undefined;
}

type AggregatedRunArtifact = {
  artifact: Artifact;
  key: string;
  title: string;
  description?: string;
  link: string;
  href: string;
  external: boolean;
  latestRun: TaskRun;
  runCount: number;
};

export function aggregateRunArtifacts(runs: TaskRun[]): AggregatedRunArtifact[] {
  const byKey = new Map<string, { artifact: Artifact; latestRun: TaskRun; runIds: Set<string> }>();

  for (const run of runs) {
    for (const artifact of run.artifacts) {
      const key = `${artifact.type}:${artifact.link}`;
      const existing = byKey.get(key);

      if (!existing) {
        byKey.set(key, { artifact, latestRun: run, runIds: new Set([run.id]) });
        continue;
      }

      existing.runIds.add(run.id);
      if (isRunNewer(run, existing.latestRun)) {
        existing.latestRun = run;
        existing.artifact = artifact;
      }
    }
  }

  return [...byKey.entries()].map(([key, entry]) => ({
    artifact: entry.artifact,
    key,
    title: entry.artifact.title,
    description: entry.artifact.description,
    link: entry.artifact.link,
    href: buildArtifactHref(entry.artifact),
    external: entry.artifact.type === "url",
    latestRun: entry.latestRun,
    runCount: entry.runIds.size,
  }));
}

function isRunNewer(candidate: TaskRun, current: TaskRun): boolean {
  return (
    Date.parse(candidate.completedAt ?? candidate.updatedAt) >
    Date.parse(current.completedAt ?? current.updatedAt)
  );
}

const DUE_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function isDueSoon(value: string): boolean {
  return new Date(value).getTime() - Date.now() < DUE_SOON_WINDOW_MS;
}

export function formatDateOnly(value: string): string {
  return new Date(value).toLocaleDateString();
}

export function formatTodoProgress(task: Task): string {
  if (task.todos.length === 0) return "0/0";

  const completed = task.todos.filter((todo) => todo.status === "completed").length;
  return `${String(completed)}/${String(task.todos.length)}`;
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${String(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to read attachment."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read attachment."));
    reader.readAsDataURL(file);
  });
}

export function formatSourceTemplate(task: Task): string {
  if (!task.sourceTemplateId) return "User-created task";
  return task.sourceOccurrenceAt
    ? `Generated ${formatDate(task.sourceOccurrenceAt)}`
    : "Generated from template";
}

export function formatTaskModel(task: Task, agent?: Specialist): string {
  if (task.model) {
    return task.model;
  }
  return agent?.defaultModel
    ? `${agent.defaultModel} (specialist default)`
    : "Specialist's default";
}

/** True when the task pins a model that differs from its specialist default. */

export function hasTaskModelOverride(task: Task, agent?: Specialist): boolean {
  return Boolean(task.model && task.model !== agent?.defaultModel);
}

export function formatTemplateRepeat(template: TaskTemplate): string {
  return template.recurrence
    ? formatRepeatSummary(template.recurrence.repeatRule)
    : "Manual template";
}

export function formatSchedule(task: Task): string {
  if (task.scheduledAt) return `Scheduled ${formatDate(task.scheduledAt)}`;
  if (task.scheduledFor) return `Scheduled ${formatDate(task.scheduledFor)}`;
  if (task.dueAt) return `Due ${formatDate(task.dueAt)}`;
  return "Not scheduled";
}

function readLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

// IANA timezone names for the schedule picker. Always include the operator's
// local zone (and "UTC") so the current selection is never missing from the
// list, even on runtimes that don't implement Intl.supportedValuesOf.

export function listTimezones(): string[] {
  const supported =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return Array.from(new Set([readLocalTimezone(), "UTC", ...supported]));
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function readError(error: unknown): string | undefined {
  return error instanceof Error && error.message ? error.message : undefined;
}

export function useTaskComposerSkills(
  agent: Specialist | undefined,
  catalog: SpecialistCatalog | undefined,
): { slug: string; description?: string }[] {
  return useMemo(() => {
    if (!agent || !catalog) return [];

    const selectedSlugs = new Set([
      ...agent.capabilities.builtInSkills,
      ...(agent.capabilities.workspaceSkills ?? []),
    ]);

    return [...catalog.builtInSkills, ...(catalog.workspaceSkills ?? [])]
      .filter((skill) => selectedSlugs.has(skill.slug))
      .map((skill) => ({ slug: skill.slug, description: skill.description }));
  }, [agent, catalog]);
}
