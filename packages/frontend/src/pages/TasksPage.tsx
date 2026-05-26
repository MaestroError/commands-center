import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type {
  Agent,
  BoardTaskStatus,
  CreateTaskInput,
  Task,
  TaskRun,
  TaskTemplate,
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
import {
  useActiveTaskRunsQuery,
  useArchivedTasksQuery,
  useTaskMutations,
  useTaskQuery,
  useTasksQuery,
  useTaskTemplatesQuery,
} from "@/hooks/use-tasks-query";
import { isTaskCreationPrefill, type TaskCreationPrefill } from "@/services/task-prefill-service";

type TasksPageProps = {
  mode?: "list" | "create" | "edit";
};

const TRIGGER_MODES = ["manual", "scheduled_once", "recurring"] as const;
const TASK_VIEWS = ["board", "templates", "archive"] as const;
const BOARD_COLUMNS = [
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
    empty: "Queued and running work appears here while the agent is active.",
  },
  {
    status: "ready_to_check",
    title: "Ready to Check",
    description: "AI work finished successfully and is waiting for acceptance.",
    empty: "Completed AI runs appear here for review before acceptance.",
  },
  {
    status: "review",
    title: "Review",
    description: "Tasks that failed, need a decision, or need feedback before retry.",
    empty: "Failures and human-review requests appear here.",
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readTaskView(searchParams);
  const currentSearch = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const tasksQuery = useTasksQuery({ includeArchived: false });
  const templatesQuery = useTaskTemplatesQuery();
  const archiveQuery = useArchivedTasksQuery();
  const activeRunsQuery = useActiveTaskRunsQuery();
  const agentsQuery = useAgentsQuery();
  const mutations = useTaskMutations();
  const [runTask, setRunTask] = useState<Task>();
  const agents = agentsQuery.data ?? [];
  const boardTasks = tasksQuery.data ?? [];
  const templates = templatesQuery.data ?? [];
  const archivedTasks = archiveQuery.data ?? [];
  const activeQuery =
    view === "templates" ? templatesQuery : view === "archive" ? archiveQuery : tasksQuery;
  const error = readError(activeQuery.error ?? agentsQuery.error);
  const isLoading = activeQuery.isLoading || agentsQuery.isLoading;

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          <Link className="cc-button" to="/tasks/new">
            Create task
          </Link>
        }
        description="Use the board for daily task work, templates for recurring generators, and archive for completed history."
        eyebrow="Tasks"
        title="Workspace tasks"
      />

      <TaskViewNav searchParams={searchParams} setSearchParams={setSearchParams} view={view} />

      {isLoading ? <LoadingState testId="tasks-loading" /> : null}
      {error ? (
        <ErrorState
          action={
            <button
              className="cc-button cc-button-secondary"
              onClick={() => void activeQuery.refetch()}
              type="button"
            >
              Try again
            </button>
          }
          description={error}
          title="Tasks could not be loaded."
        />
      ) : null}
      {!isLoading && !error && view === "board" && boardTasks.length === 0 ? (
        <EmptyState
          action={
            <Link className="cc-button" to="/tasks/new">
              Create your first task
            </Link>
          }
          description="Tasks become board cards so you can move work from backlog through acceptance."
          title="No tasks on the board"
        />
      ) : null}

      {!isLoading && !error && view === "board" && boardTasks.length > 0 ? (
        <TaskBoard
          agents={agents}
          activeRuns={activeRunsQuery.data ?? []}
          currentSearch={currentSearch}
          onAccept={(task) => void mutations.accept.mutate(task.id)}
          onArchive={(task) => void mutations.archive.mutate(task.id)}
          onCancelRun={(run) =>
            void mutations.cancelRun.mutate({
              taskId: run.taskId,
              runId: run.id,
              input: { reason: "Cancelled from task board." },
            })
          }
          onDuplicate={(task) => {
            mutations.duplicate.mutate(task.id, {
              onSuccess: (duplicated) =>
                void navigate(`/tasks/${duplicated.id}/edit${currentSearch}`),
            });
          }}
          onQueue={setRunTask}
          onReopen={(task) =>
            void mutations.update.mutate({ id: task.id, input: { status: "backlog" } })
          }
          tasks={boardTasks}
        />
      ) : null}

      {!isLoading && !error && view === "templates" ? (
        <TaskTemplatesView agents={agents} currentSearch={currentSearch} templates={templates} />
      ) : null}

      {!isLoading && !error && view === "archive" ? (
        <TaskArchiveView
          agents={agents}
          currentSearch={currentSearch}
          onDelete={(task) => void mutations.remove.mutate(task.id)}
          onRestore={(task) => void mutations.restore.mutate(task.id)}
          tasks={archivedTasks}
        />
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

function TaskViewNav(props: {
  view: TaskView;
  searchParams: URLSearchParams;
  setSearchParams: (params: URLSearchParams) => void;
}) {
  return (
    <nav aria-label="Tasks views" className="cc-panel flex flex-wrap gap-2 p-2">
      {TASK_VIEWS.map((view) => (
        <button
          aria-current={props.view === view ? "page" : undefined}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            props.view === view
              ? "bg-accent text-accent-contrast"
              : "text-text-secondary hover:bg-surface hover:text-text-primary"
          }`}
          key={view}
          onClick={() => setTaskView(props.searchParams, props.setSearchParams, view)}
          type="button"
        >
          {formatTaskView(view)}
        </button>
      ))}
    </nav>
  );
}

function TaskBoard(props: {
  tasks: Task[];
  agents: Agent[];
  activeRuns: TaskRun[];
  currentSearch: string;
  onAccept: (task: Task) => void;
  onArchive: (task: Task) => void;
  onCancelRun: (run: TaskRun) => void;
  onDuplicate: (task: Task) => void;
  onQueue: (task: Task) => void;
  onReopen: (task: Task) => void;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-6" data-testid="tasks-board">
      {BOARD_COLUMNS.map((column) => {
        const columnTasks = props.tasks.filter((task) => readBoardStatus(task) === column.status);

        return (
          <div className="cc-panel flex min-h-80 flex-col gap-3 p-4" key={column.status}>
            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold text-text-primary">{column.title}</h2>
                <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-text-secondary">
                  {columnTasks.length}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-text-secondary">{column.description}</p>
            </div>
            {columnTasks.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-surface/60 p-3 text-xs leading-5 text-text-secondary">
                {column.empty}
              </p>
            ) : null}
            <div className="grid gap-3">
              {columnTasks.map((task) => (
                <TaskBoardCard
                  activeRun={props.activeRuns.find((run) => run.taskId === task.id)}
                  agent={props.agents.find((entry) => entry.id === task.agentId)}
                  currentSearch={props.currentSearch}
                  key={task.id}
                  onAccept={() => props.onAccept(task)}
                  onArchive={() => props.onArchive(task)}
                  onCancelRun={(run) => props.onCancelRun(run)}
                  onDuplicate={() => props.onDuplicate(task)}
                  onQueue={() => props.onQueue(task)}
                  onReopen={() => props.onReopen(task)}
                  task={task}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function TaskBoardCard(props: {
  task: Task;
  agent?: Agent;
  activeRun?: TaskRun;
  currentSearch: string;
  onAccept: () => void;
  onQueue: () => void;
  onCancelRun: (run: TaskRun) => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onReopen: () => void;
}) {
  const task = props.task;
  const boardStatus = readBoardStatus(task);
  const latestRunPath = task.latestRunId
    ? `/tasks/${task.id}/runs/${task.latestRunId}${props.currentSearch}`
    : undefined;
  const activeRunPath = props.activeRun
    ? `/tasks/${task.id}/runs/${props.activeRun.id}${props.currentSearch}`
    : undefined;
  return (
    <article className={readCardClassName(boardStatus)}>
      <div className="grid gap-2">
        <Link
          className="font-semibold leading-6 text-text-primary transition hover:text-accent"
          to={`/tasks/${task.id}${props.currentSearch}`}
        >
          {task.title}
        </Link>
        <p className="line-clamp-3 text-sm leading-6 text-text-secondary">
          {task.description || "No description provided."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={boardStatus} />
        {props.activeRun ? <StatusBadge status={props.activeRun.status} /> : null}
        <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-text-secondary">
          {props.agent?.name ?? task.agentId}
        </span>
        {(task.scheduledAt ?? task.scheduledFor ?? task.dueAt) ? (
          <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-text-secondary">
            {formatTimingBadge(task)}
          </span>
        ) : null}
        {task.sourceTemplateId ? (
          <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs text-accent">
            Generated{task.sourceOccurrenceAt ? ` ${formatDate(task.sourceOccurrenceAt)}` : ""}
          </span>
        ) : null}
      </div>

      <div className="grid gap-2 text-xs text-text-secondary">
        <span>Todos: {formatTodoProgress(task)}</span>
        <span>Updated: {formatDate(task.updatedAt)}</span>
      </div>

      {task.latestFinalMessage ? (
        <p className={readResultClassName(boardStatus)}>{task.latestFinalMessage}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <TaskCardActions
          activeRun={props.activeRun}
          activeRunPath={activeRunPath}
          boardStatus={boardStatus}
          currentSearch={props.currentSearch}
          latestRunPath={latestRunPath}
          onAccept={props.onAccept}
          onArchive={props.onArchive}
          onCancelRun={props.onCancelRun}
          onDuplicate={props.onDuplicate}
          onQueue={props.onQueue}
          onReopen={props.onReopen}
          task={task}
        />
      </div>
    </article>
  );
}

function TaskCardActions(props: {
  task: Task;
  boardStatus: BoardTaskStatus;
  currentSearch: string;
  activeRun?: TaskRun;
  activeRunPath?: string;
  latestRunPath?: string;
  onAccept: () => void;
  onArchive: () => void;
  onCancelRun: (run: TaskRun) => void;
  onDuplicate: () => void;
  onQueue: () => void;
  onReopen: () => void;
}) {
  if (props.boardStatus === "queued") {
    return (
      <>
        {props.activeRunPath ? (
          <Link className="cc-button" to={props.activeRunPath}>
            View run
          </Link>
        ) : null}
        {props.activeRun ? (
          <button
            className="cc-button cc-button-secondary"
            onClick={() => {
              if (props.activeRun) props.onCancelRun(props.activeRun);
            }}
            type="button"
          >
            Cancel run
          </button>
        ) : null}
        {!props.activeRun ? (
          <button className="cc-button" onClick={props.onQueue} type="button">
            Queue
          </button>
        ) : null}
        <Link
          className="cc-button cc-button-secondary"
          to={`/tasks/${props.task.id}${props.currentSearch}`}
        >
          Details
        </Link>
      </>
    );
  }

  if (props.boardStatus === "ready_to_check") {
    return (
      <>
        <button className="cc-button" onClick={props.onAccept} type="button">
          Accept
        </button>
        {props.latestRunPath ? (
          <Link className="cc-button cc-button-secondary" to={props.latestRunPath}>
            Open run
          </Link>
        ) : null}
        <Link
          className="cc-button cc-button-secondary"
          to={`/tasks/${props.task.id}${props.currentSearch}`}
        >
          Details
        </Link>
      </>
    );
  }

  if (props.boardStatus === "review") {
    return (
      <>
        <button className="cc-button" onClick={props.onQueue} type="button">
          Retry
        </button>
        {props.latestRunPath ? (
          <Link className="cc-button cc-button-secondary" to={props.latestRunPath}>
            Open run
          </Link>
        ) : null}
        <Link
          className="cc-button cc-button-secondary"
          to={`/tasks/${props.task.id}/edit${props.currentSearch}`}
        >
          Edit
        </Link>
      </>
    );
  }

  if (props.boardStatus === "done") {
    return (
      <>
        <button className="cc-button" onClick={props.onReopen} type="button">
          Reopen
        </button>
        <button className="cc-button cc-button-secondary" onClick={props.onArchive} type="button">
          Archive
        </button>
        <Link
          className="cc-button cc-button-secondary"
          to={`/tasks/${props.task.id}${props.currentSearch}`}
        >
          Details
        </Link>
      </>
    );
  }

  return (
    <>
      <button className="cc-button" onClick={props.onQueue} type="button">
        {props.boardStatus === "scheduled" ? "Queue now" : "Queue"}
      </button>
      <Link
        className="cc-button cc-button-secondary"
        to={`/tasks/${props.task.id}/edit${props.currentSearch}`}
      >
        {props.boardStatus === "scheduled" ? "Reschedule" : "Edit"}
      </Link>
      <button className="cc-button cc-button-secondary" onClick={props.onDuplicate} type="button">
        Duplicate
      </button>
      <button className="cc-button cc-button-secondary" onClick={props.onArchive} type="button">
        Archive
      </button>
    </>
  );
}

function TaskTemplatesView(props: {
  templates: TaskTemplate[];
  agents: Agent[];
  currentSearch: string;
}) {
  if (props.templates.length === 0) {
    return (
      <EmptyState
        action={
          <button className="cc-button" disabled type="button">
            Create template
          </button>
        }
        description="Recurring generators create normal board tasks on their schedule. Template creation will live here."
        title="No recurring templates yet"
      />
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {props.templates.map((template) => {
        const agent = props.agents.find((entry) => entry.id === template.defaultAgentId);
        return (
          <article className="cc-panel grid gap-4 p-5" key={template.id}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-text-primary">{template.title}</h2>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
                  {template.description || "No description provided."}
                </p>
              </div>
              <StatusBadge status={template.status} />
            </div>
            <div className="grid gap-3 text-sm text-text-secondary sm:grid-cols-3">
              <Metric label="Default agent" value={agent?.name ?? template.defaultAgentId} />
              <Metric
                label="Recurrence"
                value={formatRepeatSummary(template.recurrence.repeatRule)}
              />
              <Metric label="Next task" value={formatDate(template.nextOccurrenceAt)} />
            </div>
            {template.latestTaskId ? (
              <Link
                className="cc-button cc-button-secondary w-fit"
                to={`/tasks/${template.latestTaskId}${props.currentSearch}`}
              >
                Open latest task
              </Link>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

function TaskArchiveView(props: {
  tasks: Task[];
  agents: Agent[];
  currentSearch: string;
  onRestore: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  if (props.tasks.length === 0) {
    return (
      <EmptyState
        description="Accepted or archived tasks appear here after they leave the active board."
        title="No archived tasks yet"
      />
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {props.tasks.map((task) => (
        <article className="cc-panel grid gap-4 p-5" key={task.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link
                className="text-xl font-semibold text-text-primary transition hover:text-accent"
                to={`/tasks/${task.id}${props.currentSearch}`}
              >
                {task.title}
              </Link>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
                {task.description || "No description provided."}
              </p>
            </div>
            <StatusBadge status="archived" />
          </div>
          <div className="grid gap-3 text-sm text-text-secondary sm:grid-cols-3">
            <Metric
              label="Agent"
              value={props.agents.find((entry) => entry.id === task.agentId)?.name ?? task.agentId}
            />
            <Metric label="Archived" value={formatDate(task.archivedAt)} />
            <Metric label="Completed" value={formatDate(task.doneAt)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="cc-button cc-button-secondary"
              onClick={() => props.onRestore(task)}
              type="button"
            >
              Restore
            </button>
            <button
              className="cc-button cc-button-danger"
              onClick={() => props.onDelete(task)}
              type="button"
            >
              Delete
            </button>
          </div>
        </article>
      ))}
    </section>
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
type TaskView = (typeof TASK_VIEWS)[number];

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

function readTaskView(params: URLSearchParams): TaskView {
  const view = params.get("view");
  return TASK_VIEWS.includes(view as TaskView) ? (view as TaskView) : "board";
}

function setTaskView(
  params: URLSearchParams,
  setSearchParams: (params: URLSearchParams) => void,
  view: TaskView,
) {
  const next = new URLSearchParams(params);
  if (view === "board") next.delete("view");
  else next.set("view", view);
  setSearchParams(next);
}

function formatTaskView(view: TaskView): string {
  if (view === "board") return "Board";
  if (view === "templates") return "Templates";
  return "Archive";
}

function readBoardStatus(task: Task): BoardTaskStatus {
  return BOARD_COLUMNS.some((column) => column.status === task.status)
    ? (task.status as BoardTaskStatus)
    : "backlog";
}

function readCardClassName(status: BoardTaskStatus): string {
  const emphasis =
    status === "ready_to_check"
      ? "border-accent/40 bg-accent/5"
      : status === "review"
        ? "border-amber-400/40 bg-amber-400/5"
        : status === "queued"
          ? "border-accent/30 bg-surface-elevated"
          : "border-border bg-surface";

  return `grid gap-3 rounded-xl border p-4 ${emphasis}`;
}

function readResultClassName(status: BoardTaskStatus): string {
  const emphasis =
    status === "ready_to_check"
      ? "border-accent/30 bg-accent/10 text-text-primary"
      : status === "review"
        ? "border-amber-400/30 bg-amber-400/10 text-text-primary"
        : "border-border bg-background text-text-secondary";

  return `rounded-lg border p-3 text-sm leading-6 ${emphasis}`;
}

function formatTimingBadge(task: Task): string {
  if (task.scheduledAt) return `Scheduled ${formatDate(task.scheduledAt)}`;
  if (task.scheduledFor) return `Scheduled ${formatDate(task.scheduledFor)}`;
  if (task.dueAt) return `Due ${formatDate(task.dueAt)}`;
  return "Not scheduled";
}

function formatTodoProgress(task: Task): string {
  if (task.todos.length === 0) return "0/0";

  const completed = task.todos.filter((todo) => todo.status === "completed").length;
  return `${String(completed)}/${String(task.todos.length)}`;
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs uppercase tracking-wide text-text-secondary">{props.label}</p>
      <p className="mt-1 truncate font-medium text-text-primary">{props.value}</p>
    </div>
  );
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
