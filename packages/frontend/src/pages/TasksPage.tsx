import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type {
  Agent,
  CreateTaskInput,
  ListTasksQuery,
  Task,
  TaskSchedule,
  TaskTriggerMode,
  UpdateTaskInput,
} from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { formatDate, formatToken } from "@/components/tasks/task-format";
import { StatusBadge } from "@/components/tasks/task-ui";
import { useAgentsQuery } from "@/hooks/use-agents-query";
import { useTaskMutations, useTaskQuery, useTasksQuery } from "@/hooks/use-tasks-query";

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
          description="Tasks can run manually, once at a scheduled time, or repeatedly on a cron schedule."
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
              onTrigger={() => void mutations.trigger.mutate(task.id)}
              task={task}
            />
          ))}
        </section>
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
  const params = useParams();
  const taskQuery = useTaskQuery(props.mode === "edit" ? params["id"] : undefined);
  const agentsQuery = useAgentsQuery();
  const mutations = useTaskMutations();
  const task = taskQuery.data;
  const agents = agentsQuery.data ?? [];
  const [form, setForm] = useState<FormState>(() => taskToForm(task));

  useMemo(() => {
    if (task) setForm(taskToForm(task));
  }, [task]);

  const isLoading = agentsQuery.isLoading || (props.mode === "edit" && taskQuery.isLoading);
  const error = readError(
    agentsQuery.error ?? taskQuery.error ?? mutations.create.error ?? mutations.update.error,
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
        description="Define the prompt context, schedule, assigned agent, and lightweight task todo list."
        eyebrow="Tasks"
        title={props.mode === "create" ? "Create task" : "Edit task"}
      />

      {isLoading ? <LoadingState testId="task-form-loading" /> : null}
      {error ? <ErrorState description={error} title="Task could not be saved." /> : null}

      {!isLoading ? (
        <form
          className="cc-panel grid gap-5 p-4 sm:p-6"
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
                onChange={(event) => updateForm({ agentId: event.target.value })}
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

          <label className="grid gap-1 text-sm text-text-secondary">
            Description
            <textarea
              className="cc-input min-h-24 resize-y"
              value={form.description}
              onChange={(event) => updateForm({ description: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm text-text-secondary">
            Context
            <textarea
              className="cc-input min-h-32 resize-y"
              value={form.context}
              onChange={(event) => updateForm({ context: event.target.value })}
            />
          </label>

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
              <label className="grid gap-1 text-sm text-text-secondary lg:col-span-2">
                Cron expression
                <input
                  className="cc-input font-mono"
                  placeholder="0 9 * * *"
                  value={form.cronExpression}
                  onChange={(event) => updateForm({ cronExpression: event.target.value })}
                />
              </label>
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
      ) : null}
    </div>
  );

  function updateForm(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
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
  description: string;
  context: string;
  triggerMode: TaskTriggerMode;
  runAtLocal: string;
  cronExpression: string;
  todosText: string;
};

function taskToForm(task?: Task): FormState {
  return {
    agentId: task?.agentId ?? "",
    title: task?.title ?? "",
    description: task?.description ?? "",
    context: task?.context ?? "",
    triggerMode: task?.triggerMode ?? "manual",
    runAtLocal:
      task?.schedule.mode === "scheduled_once" ? toLocalDateTime(task.schedule.runAt) : "",
    cronExpression: task?.schedule.mode === "recurring" ? task.schedule.cronExpression : "",
    todosText: task?.todos.map((todo) => todo.content).join("\n") ?? "",
  };
}

function formToTaskInput(form: FormState): CreateTaskInput | UpdateTaskInput {
  return {
    agentId: form.agentId,
    title: form.title,
    description: form.description,
    context: form.context,
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
    return { mode: "recurring", cronExpression: form.cronExpression || "0 9 * * *" };
  }
  return { mode: "manual" };
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
  if (schedule.mode === "recurring") return schedule.cronExpression;
  return "Manual only";
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function readError(error: unknown): string | undefined {
  return error instanceof Error && error.message ? error.message : undefined;
}
