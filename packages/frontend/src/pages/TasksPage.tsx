import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type {
  Agent,
  CreateTaskInput,
  ListTasksQuery,
  Task,
  TaskRepeatRule,
  TaskSchedule,
  TaskTriggerMode,
  UpdateTaskInput,
} from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { RunTaskContextDialog } from "@/components/tasks/RunTaskContextDialog";
import { TaskPromptComposer } from "@/components/tasks/TaskPromptComposer";
import {
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
import { StatusBadge } from "@/components/tasks/task-ui";
import { WorkspaceFilesTab } from "@/components/workspace/WorkspaceFilesTab";
import { useAgentCatalogQuery, useAgentsQuery } from "@/hooks/use-agents-query";
import { useTaskMutations, useTaskQuery, useTasksQuery } from "@/hooks/use-tasks-query";
import { isTaskCreationPrefill, type TaskCreationPrefill } from "@/services/task-prefill-service";

type TasksPageProps = {
  mode?: "list" | "create" | "edit";
};

const TASK_STATUSES = [
  "draft",
  "enabled",
  "disabled",
  "archived",
  "running",
  "in_progress",
  "failed",
  "completed",
] as const;

const TRIGGER_MODES = ["manual", "scheduled_once", "recurring"] as const;
const REPEAT_PRESETS = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "weekday",
  "custom",
] as const;
const REPEAT_FREQUENCIES = ["hour", "day", "week", "month", "year"] as const;
const WEEKDAYS = [
  { value: 0, label: formatWeekday(0) ?? "Sun" },
  { value: 1, label: formatWeekday(1) ?? "Mon" },
  { value: 2, label: formatWeekday(2) ?? "Tue" },
  { value: 3, label: formatWeekday(3) ?? "Wed" },
  { value: 4, label: formatWeekday(4) ?? "Thu" },
  { value: 5, label: formatWeekday(5) ?? "Fri" },
  { value: 6, label: formatWeekday(6) ?? "Sat" },
] as const;

export function TasksPage(props: TasksPageProps) {
  if (props.mode === "create") return <TaskFormPage mode="create" />;
  if (props.mode === "edit") return <TaskFormPage mode="edit" />;
  return <TaskListPage />;
}

function TaskListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);
  const tasksQuery = useTasksQuery(filters);
  const agentsQuery = useAgentsQuery();
  const mutations = useTaskMutations();
  const [runTask, setRunTask] = useState<Task>();
  const agents = agentsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const error = readError(tasksQuery.error ?? agentsQuery.error);

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          <Link className="cc-button" to="/tasks/new">
            Create task
          </Link>
        }
        description="Create scheduled or manual work, inspect run history, and keep task sessions separate from normal chat until you open them."
        eyebrow="Tasks"
        title="Workspace tasks"
      />

      <section className="cc-panel grid gap-4 p-4 sm:p-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Filters</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Narrow by state, schedule style, assigned agent, or include archived work.
            </p>
          </div>
          <button
            className="cc-button cc-button-secondary w-fit"
            onClick={() => setSearchParams({})}
            type="button"
          >
            Clear filters
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-sm text-text-secondary">
            Status
            <select
              className="cc-input"
              onChange={(event) =>
                setFilter(searchParams, setSearchParams, "status", event.target.value)
              }
              value={filters.status ?? ""}
            >
              <option value="">Any status</option>
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatToken(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-text-secondary">
            Trigger mode
            <select
              className="cc-input"
              onChange={(event) =>
                setFilter(searchParams, setSearchParams, "triggerMode", event.target.value)
              }
              value={filters.triggerMode ?? ""}
            >
              <option value="">Any trigger</option>
              {TRIGGER_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {formatToken(mode)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-text-secondary">
            Agent
            <select
              className="cc-input"
              onChange={(event) =>
                setFilter(searchParams, setSearchParams, "agentId", event.target.value)
              }
              value={filters.agentId ?? ""}
            >
              <option value="">Any agent</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary">
            <input
              checked={filters.includeArchived ?? false}
              onChange={(event) =>
                setFilter(
                  searchParams,
                  setSearchParams,
                  "includeArchived",
                  event.target.checked ? "true" : "",
                )
              }
              type="checkbox"
            />
            Include archived tasks
          </label>
        </div>
      </section>

      {tasksQuery.isLoading || agentsQuery.isLoading ? (
        <LoadingState testId="tasks-loading" />
      ) : null}
      {error ? (
        <ErrorState
          action={
            <button
              className="cc-button cc-button-secondary"
              onClick={() => void tasksQuery.refetch()}
              type="button"
            >
              Try again
            </button>
          }
          description={error}
          title="Tasks could not be loaded."
        />
      ) : null}
      {!tasksQuery.isLoading && !error && tasks.length === 0 ? (
        <EmptyState
          action={
            <Link className="cc-button" to="/tasks/new">
              Create your first task
            </Link>
          }
          description="Tasks can run manually, once at a scheduled time, or on a simple repeat schedule."
          title="No tasks match this view"
        />
      ) : null}

      {tasks.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {tasks.map((task) => (
            <TaskCard
              agent={agents.find((entry) => entry.id === task.agentId)}
              key={task.id}
              onArchive={() => void mutations.archive.mutate(task.id)}
              onDelete={() => void mutations.remove.mutate(task.id)}
              onDisable={() => void mutations.disable.mutate(task.id)}
              onEnable={() => void mutations.enable.mutate(task.id)}
              onRestore={() => void mutations.restore.mutate(task.id)}
              onTrigger={() => setRunTask(task)}
              task={task}
            />
          ))}
        </section>
      ) : null}
      {runTask ? (
        <RunTaskContextDialog
          busy={mutations.trigger.isPending}
          taskTitle={runTask.title}
          onCancel={() => setRunTask(undefined)}
          onRun={(input) => {
            setRunTask(undefined);
            mutations.trigger.mutate({ id: runTask.id, input });
          }}
        />
      ) : null}
    </div>
  );
}

function TaskCard(props: {
  task: Task;
  agent?: Agent;
  onTrigger: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const task = props.task;
  return (
    <article className="cc-panel grid gap-5 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="text-xl font-semibold text-text-primary transition hover:text-accent"
              to={`/tasks/${task.id}`}
            >
              {task.title}
            </Link>
            <StatusBadge status={task.status} />
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
            {task.description || "No description provided."}
          </p>
        </div>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
          {formatToken(task.triggerMode)}
        </span>
      </div>

      <div className="grid gap-3 text-sm text-text-secondary sm:grid-cols-3">
        <Metric label="Agent" value={props.agent?.name ?? task.agentId} />
        <Metric label="Next run" value={formatNextRun(task.schedule)} />
        <Metric
          label="Todos"
          value={`${String(task.todos.filter((todo) => todo.status === "completed").length)}/${String(task.todos.length)}`}
        />
      </div>

      {task.latestResultSummary ? (
        <p className="rounded-lg border border-border bg-surface p-3 text-sm leading-6 text-text-secondary">
          {task.latestResultSummary}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link className="cc-button cc-button-secondary" to={`/tasks/${task.id}`}>
          Details
        </Link>
        <Link className="cc-button cc-button-secondary" to={`/tasks/${task.id}/edit`}>
          Edit
        </Link>
        {!task.archived ? (
          <button className="cc-button" onClick={props.onTrigger} type="button">
            Run now
          </button>
        ) : null}
        {!task.archived && task.enabled ? (
          <button className="cc-button cc-button-secondary" onClick={props.onDisable} type="button">
            Disable
          </button>
        ) : null}
        {!task.archived && !task.enabled ? (
          <button className="cc-button cc-button-secondary" onClick={props.onEnable} type="button">
            Enable
          </button>
        ) : null}
        {task.archived ? (
          <button className="cc-button cc-button-secondary" onClick={props.onRestore} type="button">
            Restore
          </button>
        ) : (
          <button className="cc-button cc-button-secondary" onClick={props.onArchive} type="button">
            Archive
          </button>
        )}
        <button className="cc-button cc-button-danger" onClick={props.onDelete} type="button">
          Delete
        </button>
      </div>
    </article>
  );
}

function TaskFormPage(props: { mode: "create" | "edit" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const taskQuery = useTaskQuery(props.mode === "edit" ? params["id"] : undefined);
  const agentsQuery = useAgentsQuery();
  const catalogQuery = useAgentCatalogQuery();
  const mutations = useTaskMutations();
  const task = taskQuery.data;
  const agents = agentsQuery.data ?? [];
  const prefill = getTaskCreationPrefill(location.state);
  const [form, setForm] = useState<FormState>(() => taskToForm(task, prefill));
  const selectedAgent = agents.find((agent) => agent.id === form.agentId);
  const taskSkills = useMemo(() => {
    if (!selectedAgent || !catalogQuery.data) return [];

    const selectedSlugs = new Set([
      ...selectedAgent.capabilities.builtInSkills,
      ...(selectedAgent.capabilities.workspaceSkills ?? []),
    ]);

    return [...catalogQuery.data.builtInSkills, ...(catalogQuery.data.workspaceSkills ?? [])]
      .filter((skill) => selectedSlugs.has(skill.slug))
      .map((skill) => ({ slug: skill.slug, description: skill.description }));
  }, [catalogQuery.data, selectedAgent]);

  useMemo(() => {
    if (task) setForm(taskToForm(task));
  }, [task]);

  const isLoading =
    agentsQuery.isLoading ||
    catalogQuery.isLoading ||
    (props.mode === "edit" && taskQuery.isLoading);
  const error = readError(
    agentsQuery.error ??
      catalogQuery.error ??
      taskQuery.error ??
      mutations.create.error ??
      mutations.update.error,
  );

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          <Link
            className="cc-button cc-button-secondary"
            to={task ? `/tasks/${task.id}` : "/tasks"}
          >
            Cancel
          </Link>
        }
        description="Define the schedule, assigned agent, and lightweight task todo list. Run-specific context is added when triggering the task."
        eyebrow="Tasks"
        title={props.mode === "create" ? "Create task" : "Edit task"}
      />

      {isLoading ? <LoadingState testId="task-form-loading" /> : null}
      {error ? <ErrorState description={error} title="Task could not be saved." /> : null}

      {!isLoading ? (
        <WorkspaceLayout
          contextPane={{
            title: selectedAgent ? `${selectedAgent.name} workspace` : "Agent workspace",
            tabs: [
              {
                id: "files",
                label: "Files",
                content: selectedAgent ? (
                  <div className="flex h-full flex-col">
                    <p className="px-3 pt-3 text-sm text-text-secondary">
                      Browse workspace files and drag relevant files into the task prompt.
                    </p>
                    <WorkspaceFilesTab agentId={selectedAgent.id} agentSlug={selectedAgent.slug} />
                  </div>
                ) : (
                  <p className="p-3 text-sm text-text-secondary">
                    Select an agent to browse workspace files and drag files into the task prompt.
                  </p>
                ),
              },
            ],
            defaultTabId: "files",
          }}
          primary={
            <form
              className="grid h-full gap-5 overflow-auto p-4 sm:p-6"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="grid gap-1 text-sm text-text-secondary">
                  Title
                  <input
                    className="cc-input"
                    required
                    value={form.title}
                    onChange={(event) => updateForm({ title: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm text-text-secondary">
                  Assigned agent
                  <select
                    className="cc-input"
                    required
                    value={form.agentId}
                    onChange={(event) => handleAgentChange(event.target.value)}
                  >
                    <option value="">Select an agent</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <section className="grid gap-1 text-sm text-text-secondary">
                <div>
                  <h2 className="font-medium text-text-primary">Task prompt</h2>
                  <p className="text-xs text-text-secondary">
                    Use # to mention workspace files and / to pick a skill available to the selected
                    agent.
                  </p>
                </div>
                <TaskPromptComposer
                  agentId={form.agentId || undefined}
                  disabled={!form.agentId}
                  onChange={(prompt) => updateForm({ prompt })}
                  skills={taskSkills}
                  value={form.prompt}
                />
              </section>
              <div className="grid gap-4 lg:grid-cols-3">
                <label className="grid gap-1 text-sm text-text-secondary">
                  Trigger mode
                  <select
                    className="cc-input"
                    value={form.triggerMode}
                    onChange={(event) =>
                      updateForm({ triggerMode: event.target.value as TaskTriggerMode })
                    }
                  >
                    {TRIGGER_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {formatToken(mode)}
                      </option>
                    ))}
                  </select>
                </label>
                {form.triggerMode === "scheduled_once" ? (
                  <label className="grid gap-1 text-sm text-text-secondary lg:col-span-2">
                    Run at
                    <input
                      className="cc-input"
                      type="datetime-local"
                      value={form.runAtLocal}
                      onChange={(event) => updateForm({ runAtLocal: event.target.value })}
                    />
                  </label>
                ) : null}
                {form.triggerMode === "recurring" ? (
                  <section className="grid min-w-0 gap-3 rounded-xl border border-border bg-surface p-4 lg:col-span-2">
                    <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <label className="grid min-w-0 gap-1 text-sm text-text-secondary">
                        Repeat
                        <select
                          className="cc-input min-w-0"
                          value={form.repeatPreset}
                          onChange={(event) =>
                            updateForm({ repeatPreset: event.target.value as RepeatPreset })
                          }
                        >
                          {REPEAT_PRESETS.map((preset) => (
                            <option key={preset} value={preset}>
                              {formatRepeatPreset(preset)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid min-w-0 gap-1 text-sm text-text-secondary">
                        Starts at
                        <input
                          className="cc-input min-w-0"
                          type="datetime-local"
                          value={form.anchorAtLocal}
                          onChange={(event) => updateForm({ anchorAtLocal: event.target.value })}
                        />
                      </label>
                    </div>
                    {form.repeatPreset === "custom" ? (
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <label className="grid min-w-0 gap-1 text-sm text-text-secondary">
                          Every
                          <input
                            className="cc-input min-w-0"
                            min={1}
                            type="number"
                            value={form.repeatInterval}
                            onChange={(event) => updateForm({ repeatInterval: event.target.value })}
                          />
                        </label>
                        <label className="grid min-w-0 gap-1 text-sm text-text-secondary">
                          Unit
                          <select
                            className="cc-input min-w-0"
                            value={form.repeatFrequency}
                            onChange={(event) =>
                              updateForm({ repeatFrequency: event.target.value as RepeatFrequency })
                            }
                          >
                            {REPEAT_FREQUENCIES.map((frequency) => (
                              <option key={frequency} value={frequency}>
                                {formatToken(frequency)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {form.repeatFrequency === "week" ? (
                          <WeekdayPicker form={form} updateForm={updateForm} />
                        ) : null}
                      </div>
                    ) : null}
                    {form.repeatPreset === "weekly" ? (
                      <WeekdayPicker form={form} updateForm={updateForm} />
                    ) : null}
                    <p className="text-sm text-text-secondary">
                      {formatRepeatSummary(buildRepeatRule(form))}
                    </p>
                  </section>
                ) : null}
              </div>

              <label className="grid gap-1 text-sm text-text-secondary">
                Todo items, one per line
                <textarea
                  className="cc-input min-h-28 resize-y"
                  value={form.todosText}
                  onChange={(event) => updateForm({ todosText: event.target.value })}
                />
              </label>

              <section className="rounded-xl border border-border bg-surface p-4">
                <h2 className="font-semibold text-text-primary">Permission profile</h2>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  This UI currently inherits the assigned agent permissions. Task runs still persist
                  their effective permission snapshot and auto-approve task-safe rules.
                </p>
              </section>

              <div className="flex flex-wrap gap-2">
                <button
                  className="cc-button"
                  disabled={mutations.create.isPending || mutations.update.isPending}
                  type="submit"
                >
                  {props.mode === "create" ? "Create task" : "Save task"}
                </button>
                <Link
                  className="cc-button cc-button-secondary"
                  to={task ? `/tasks/${task.id}` : "/tasks"}
                >
                  Cancel
                </Link>
              </div>
            </form>
          }
        />
      ) : null}
    </div>
  );

  function updateForm(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function handleAgentChange(agentId: string) {
    setForm((current) => ({
      ...current,
      agentId,
      prompt:
        current.agentId === agentId
          ? current.prompt
          : {
              ...current.prompt,
              mentionedFiles: [],
              selectedSkill: null,
            },
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = formToTaskInput(form);

    if (props.mode === "create") {
      const created = await mutations.create.mutateAsync(input as CreateTaskInput);
      void navigate(`/tasks/${created.id}`);
      return;
    }

    if (task) {
      const updated = await mutations.update.mutateAsync({
        id: task.id,
        input: input as UpdateTaskInput,
      });
      void navigate(`/tasks/${updated.id}`);
    }
  }
}

type FormState = {
  agentId: string;
  title: string;
  prompt: TaskPromptValue;
  triggerMode: TaskTriggerMode;
  runAtLocal: string;
  anchorAtLocal: string;
  timezone: string;
  repeatPreset: RepeatPreset;
  repeatFrequency: RepeatFrequency;
  repeatInterval: string;
  repeatWeekdays: number[];
  todosText: string;
};

type RepeatPreset = (typeof REPEAT_PRESETS)[number];
type RepeatFrequency = (typeof REPEAT_FREQUENCIES)[number];

function taskToForm(task?: Task, prefill?: TaskCreationPrefill): FormState {
  return {
    agentId: task?.agentId ?? prefill?.agentId ?? "",
    title: task?.title ?? "",
    prompt: task
      ? createTaskPromptValue(task.description)
      : (prefill?.prompt ?? createTaskPromptValue()),
    triggerMode: task?.triggerMode ?? "manual",
    runAtLocal:
      task?.schedule.mode === "scheduled_once" ? toLocalDateTime(task.schedule.runAt) : "",
    anchorAtLocal:
      task?.schedule.mode === "recurring" ? toLocalDateTime(task.schedule.anchorAt) : "",
    timezone: task?.schedule.mode === "recurring" ? task.schedule.timezone : readLocalTimezone(),
    repeatPreset:
      task?.schedule.mode === "recurring" ? scheduleToRepeatPreset(task.schedule) : "hourly",
    repeatFrequency:
      task?.schedule.mode === "recurring" ? task.schedule.repeatRule.frequency : "hour",
    repeatInterval:
      task?.schedule.mode === "recurring" ? String(task.schedule.repeatRule.interval) : "1",
    repeatWeekdays:
      task?.schedule.mode === "recurring" ? (task.schedule.repeatRule.weekdays ?? []) : [],
    todosText: task?.todos.map((todo) => todo.content).join("\n") ?? "",
  };
}

function getTaskCreationPrefill(state: unknown): TaskCreationPrefill | undefined {
  if (!state || typeof state !== "object" || !("taskPrefill" in state)) {
    return undefined;
  }

  const taskPrefill = (state as { taskPrefill: unknown }).taskPrefill;
  return isTaskCreationPrefill(taskPrefill) ? taskPrefill : undefined;
}

function formToTaskInput(form: FormState): CreateTaskInput | UpdateTaskInput {
  return {
    agentId: form.agentId,
    title: form.title,
    description: buildTaskPromptText(form.prompt),
    todos: form.todosText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((content) => ({ content })),
    triggerMode: form.triggerMode,
    schedule: buildSchedule(form),
    enabled: true,
  };
}

function buildSchedule(form: FormState): TaskSchedule {
  if (form.triggerMode === "scheduled_once") {
    return { mode: "scheduled_once", runAt: new Date(form.runAtLocal || Date.now()).toISOString() };
  }
  if (form.triggerMode === "recurring") {
    return {
      mode: "recurring",
      anchorAt: new Date(form.anchorAtLocal || Date.now()).toISOString(),
      timezone: form.timezone || readLocalTimezone(),
      repeatRule: buildRepeatRule(form),
    };
  }
  return { mode: "manual" };
}

function WeekdayPicker(props: {
  form: FormState;
  updateForm: (patch: Partial<FormState>) => void;
}) {
  return (
    <fieldset className="grid gap-2 sm:col-span-2">
      <legend className="text-sm text-text-secondary">Weekdays</legend>
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map((weekday) => (
          <label
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-secondary"
            key={weekday.value}
          >
            <input
              checked={props.form.repeatWeekdays.includes(weekday.value)}
              onChange={(event) => {
                const selected = event.target.checked
                  ? [...props.form.repeatWeekdays, weekday.value]
                  : props.form.repeatWeekdays.filter((value) => value !== weekday.value);
                props.updateForm({ repeatWeekdays: selected });
              }}
              type="checkbox"
            />
            {weekday.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function buildRepeatRule(form: FormState): TaskRepeatRule {
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

function scheduleToRepeatPreset(
  schedule: Extract<TaskSchedule, { mode: "recurring" }>,
): RepeatPreset {
  const rule = schedule.repeatRule;

  if (rule.frequency === "hour" && rule.interval === 1) return "hourly";
  if (rule.frequency === "day" && rule.interval === 1) return "daily";
  if (rule.frequency === "month" && rule.interval === 1) return "monthly";
  if (rule.frequency === "year" && rule.interval === 1) return "yearly";
  if (rule.frequency === "week" && rule.interval === 1) {
    if (rule.weekdays?.join(",") === "1,2,3,4,5") return "weekday";
    return "weekly";
  }

  return "custom";
}

function formatRepeatPreset(preset: RepeatPreset): string {
  if (preset === "hourly") return "Every hour";
  if (preset === "weekday") return "Every weekday";
  return preset === "custom" ? "Custom" : formatToken(preset);
}

function readFilters(params: URLSearchParams): Partial<ListTasksQuery> {
  return {
    status: (params.get("status") as ListTasksQuery["status"]) || undefined,
    triggerMode: (params.get("triggerMode") as ListTasksQuery["triggerMode"]) || undefined,
    agentId: params.get("agentId") || undefined,
    includeArchived: params.get("includeArchived") === "true",
  };
}

function setFilter(
  params: URLSearchParams,
  setSearchParams: (params: URLSearchParams) => void,
  key: string,
  value: string,
) {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  setSearchParams(next);
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs uppercase tracking-wide text-text-secondary">{props.label}</p>
      <p className="mt-1 truncate font-medium text-text-primary">{props.value}</p>
    </div>
  );
}

function formatNextRun(schedule: TaskSchedule): string {
  if (schedule.mode === "scheduled_once") return formatDate(schedule.runAt);
  if (schedule.mode === "recurring") return formatRepeatSummary(schedule.repeatRule);
  return "Manual only";
}

function readLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function readError(error: unknown): string | undefined {
  return error instanceof Error && error.message ? error.message : undefined;
}
