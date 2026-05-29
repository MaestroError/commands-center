import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type {
  Agent,
  BoardTaskStatus,
  CreateTaskInput,
  CreateTaskTemplateInput,
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
import { TabBar } from "@/components/common/TabBar";
import { AgentAvatar } from "@/components/agents/agent-avatar";
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
  useTaskTemplateQuery,
  useTaskTemplateTasksQuery,
  useTaskRunsQuery,
  useTasksQuery,
  useTaskTemplatesQuery,
} from "@/hooks/use-tasks-query";
import { buildFileManagerHref } from "@/lib/file-manager-href";
import { isTaskCreationPrefill, type TaskCreationPrefill } from "@/services/task-prefill-service";

type TasksPageProps = {
  mode?: "list" | "create" | "edit";
};

type DetailSectionId = "overview" | "feedback" | "subtasks" | "runs" | "context" | "activity";

const TRIGGER_MODES = ["manual", "scheduled_once", "recurring"] as const;
const TASK_VIEWS = ["board", "templates", "archive"] as const;
const DETAIL_SECTION_TABS = [
  { id: "overview", label: "Overview" },
  { id: "feedback", label: "Feedback" },
  { id: "subtasks", label: "Subtasks" },
  { id: "runs", label: "Runs" },
  { id: "context", label: "Context" },
  { id: "activity", label: "Activity" },
];
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
  const selectedTaskId = searchParams.get("task") ?? undefined;
  const selectedTemplateId = searchParams.get("template") ?? undefined;
  const currentSearch = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const activeRunsQuery = useActiveTaskRunsQuery();
  const activeRuns = activeRunsQuery.data ?? [];
  const previousActiveRunCountRef = useRef(0);
  const tasksQuery = useTasksQuery(
    { includeArchived: false },
    { refetchInterval: activeRuns.length > 0 ? 3_000 : false },
  );
  const templatesQuery = useTaskTemplatesQuery();
  const archiveQuery = useArchivedTasksQuery();
  const agentsQuery = useAgentsQuery();
  const mutations = useTaskMutations();
  const [runTemplate, setRunTemplate] = useState<TaskTemplate>();
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const agents = agentsQuery.data ?? [];
  const boardTasks = tasksQuery.data ?? [];
  const templates = templatesQuery.data ?? [];
  const archivedTasks = archiveQuery.data ?? [];
  const activeQuery =
    view === "templates" ? templatesQuery : view === "archive" ? archiveQuery : tasksQuery;
  const error = readError(activeQuery.error ?? agentsQuery.error);
  const isLoading = activeQuery.isLoading || agentsQuery.isLoading;
  const refetchTasks = tasksQuery.refetch;

  useEffect(() => {
    if (previousActiveRunCountRef.current > 0 && activeRuns.length === 0) {
      void refetchTasks();
    }

    previousActiveRunCountRef.current = activeRuns.length;
  }, [activeRuns.length, refetchTasks]);

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          view === "templates" ? (
            <button className="cc-button" onClick={() => setIsCreatingTemplate(true)} type="button">
              Create template
            </button>
          ) : (
            <Link className="cc-button" to="/tasks/new">
              Create task
            </Link>
          )
        }
        description="Use the board for daily task work, templates for reusable task setup, and archive for completed history."
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
          activeRuns={activeRuns}
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
          onQueue={(task) => mutations.trigger.mutate({ id: task.id })}
          onReopen={(task) =>
            void mutations.update.mutate({ id: task.id, input: { status: "backlog" } })
          }
          onSelect={(task) => setSelectedTask(searchParams, setSearchParams, task.id)}
          tasks={boardTasks}
        />
      ) : null}

      {!isLoading && !error && view === "templates" ? (
        <TaskTemplatesView
          agents={agents}
          currentSearch={currentSearch}
          isCreating={isCreatingTemplate}
          isCreatingBusy={mutations.createTemplate.isPending}
          onCancelCreate={() => setIsCreatingTemplate(false)}
          onCreate={(input) => {
            mutations.createTemplate.mutate(input, {
              onSuccess: (template) => {
                setIsCreatingTemplate(false);
                setSelectedTemplate(searchParams, setSearchParams, template.id);
              },
            });
          }}
          onRunNow={setRunTemplate}
          onDelete={(template) => void mutations.remove.mutate(template.id)}
          onCreateTask={(template) => {
            mutations.createFromTemplate.mutate(template.id, {
              onSuccess: (task) => selectGeneratedTask(searchParams, setSearchParams, task.id),
            });
          }}
          onSelect={(template) => setSelectedTemplate(searchParams, setSearchParams, template.id)}
          onStartCreate={() => setIsCreatingTemplate(true)}
          templates={templates}
        />
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
      {runTemplate ? (
        <RunTaskContextDialog
          busy={mutations.runTemplateNow.isPending}
          taskTitle={runTemplate.title}
          onCancel={() => setRunTemplate(undefined)}
          onRun={(input) => {
            const templateId = runTemplate.id;
            setRunTemplate(undefined);
            mutations.runTemplateNow.mutate(
              { id: templateId, input },
              {
                onSuccess: (run) => {
                  selectGeneratedTask(searchParams, setSearchParams, run.taskId);
                },
              },
            );
          }}
        />
      ) : null}
      {selectedTaskId ? (
        <TaskDetailPanel
          activeRun={activeRunsQuery.data?.find((run) => run.taskId === selectedTaskId)}
          agents={agents}
          currentSearch={currentSearch}
          onAccept={(task) => void mutations.accept.mutate(task.id)}
          onArchive={(task) => void mutations.archive.mutate(task.id)}
          onClose={() => clearSelectedTask(searchParams, setSearchParams)}
          onQueue={(task) => mutations.trigger.mutate({ id: task.id })}
          onRestore={(task) => void mutations.restore.mutate(task.id)}
          onReopen={(task) =>
            void mutations.update.mutate({ id: task.id, input: { status: "backlog" } })
          }
          onUpdateContext={(task, text) => {
            mutations.updateContext.mutate({
              id: task.id,
              input: { text, attachments: task.context.attachments },
            });
          }}
          onUploadContextAttachment={(task, file) => {
            void readFileAsDataUrl(file).then((dataUrl) => {
              mutations.uploadContextAttachment.mutate({
                id: task.id,
                input: {
                  filename: file.name,
                  mimeType: file.type,
                  sizeBytes: file.size,
                  dataUrl,
                },
              });
            });
          }}
          taskId={selectedTaskId}
        />
      ) : null}
      {selectedTemplateId ? (
        <TaskTemplateDetailPanel
          agents={agents}
          currentSearch={currentSearch}
          onClose={() => clearSelectedTemplate(searchParams, setSearchParams)}
          onOpenTask={(taskId) => {
            selectGeneratedTask(searchParams, setSearchParams, taskId);
          }}
          onCreateTask={(template) => {
            mutations.createFromTemplate.mutate(template.id, {
              onSuccess: (task) => selectGeneratedTask(searchParams, setSearchParams, task.id),
            });
          }}
          onRunNow={setRunTemplate}
          onDelete={(template) => {
            mutations.remove.mutate(template.id, {
              onSuccess: () => clearSelectedTemplate(searchParams, setSearchParams),
            });
          }}
          templateId={selectedTemplateId}
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
  onSelect: (task: Task) => void;
}) {
  return (
    <section className="overflow-x-auto pb-3" data-testid="tasks-board">
      <div className="flex min-w-max gap-4">
        {BOARD_COLUMNS.map((column) => {
          const columnTasks = props.tasks.filter((task) => readBoardStatus(task) === column.status);

          return (
            <div
              className="cc-panel flex min-h-80 w-80 min-w-0 shrink-0 flex-col gap-3 p-4"
              key={column.status}
            >
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
              <div className="grid min-w-0 gap-3">
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
                    onSelect={() => props.onSelect(task)}
                    task={task}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
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
  onSelect: () => void;
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
        <div className="flex min-w-0 items-start justify-between gap-3">
          <Link
            className="min-w-0 break-words [overflow-wrap:anywhere] font-semibold leading-6 text-text-primary transition hover:text-accent"
            to={`/tasks${buildPanelSearch(props.currentSearch, task.id)}`}
            onClick={props.onSelect}
          >
            {task.title}
          </Link>
          <BoardAssigneeAvatar agent={props.agent} fallbackName={task.agentId} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={boardStatus} />
        {props.activeRun?.status === "running" ? (
          <StatusBadge status={props.activeRun.status} />
        ) : null}
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
          onSelect={props.onSelect}
          task={task}
        />
      </div>
    </article>
  );
}

function BoardAssigneeAvatar(props: { agent?: Agent; fallbackName: string }) {
  const name = props.agent?.name ?? props.fallbackName;

  return (
    <span
      aria-label={`Assignee: ${name}`}
      className="group relative inline-flex shrink-0"
      tabIndex={0}
      title={name}
    >
      <AgentAvatar
        className="h-7 w-7 rounded-full text-[11px]"
        iconPath={props.agent?.iconPath}
        name={name}
        size="sm"
      />
      <span
        className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-max max-w-48 whitespace-normal break-words [overflow-wrap:anywhere] rounded-md border border-border bg-surface-elevated px-2 py-1 text-left text-xs text-text-primary opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        role="tooltip"
      >
        {name}
      </span>
    </span>
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
  onSelect: () => void;
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
          to={`/tasks${buildPanelSearch(props.currentSearch, props.task.id)}`}
          onClick={props.onSelect}
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
          to={`/tasks${buildPanelSearch(props.currentSearch, props.task.id)}`}
          onClick={props.onSelect}
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
          to={`/tasks${buildPanelSearch(props.currentSearch, props.task.id)}`}
          onClick={props.onSelect}
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

function TaskDetailPanel(props: {
  taskId: string;
  agents: Agent[];
  activeRun?: TaskRun;
  currentSearch: string;
  onAccept: (task: Task) => void;
  onArchive: (task: Task) => void;
  onClose: () => void;
  onQueue: (task: Task) => void;
  onRestore: (task: Task) => void;
  onReopen: (task: Task) => void;
  onUpdateContext: (task: Task, text: string) => void;
  onUploadContextAttachment: (task: Task, file: File) => void;
}) {
  const taskQuery = useTaskQuery(props.taskId);
  const runsQuery = useTaskRunsQuery(props.taskId);
  const [selectedSectionId, setSelectedSectionId] = useState<DetailSectionId>();
  const task = taskQuery.data;
  const agent = props.agents.find((entry) => entry.id === task?.agentId);
  const activeSectionId = selectedSectionId ?? getDefaultDetailSection(task);

  return (
    <aside
      aria-label="Task detail panel"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-border bg-surface-elevated shadow-2xl lg:top-0"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border bg-surface-elevated p-4 sm:p-5">
        <div className="min-w-0">
          <p className="cc-eyebrow">Task Detail</p>
          <h2 className="mt-2 text-2xl font-semibold text-text-primary">
            {task?.title ?? "Task detail"}
          </h2>
        </div>
        <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
          Close
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-elevated p-4 sm:p-5">
        {taskQuery.isLoading ? <LoadingState testId="task-panel-loading" /> : null}
        {taskQuery.error ? (
          <ErrorState
            description={readError(taskQuery.error) ?? "Unknown error"}
            title="Task could not be loaded."
          />
        ) : null}
        {!taskQuery.isLoading && !task ? (
          <EmptyState description="This task no longer exists." title="Task not found" />
        ) : null}
        {task ? (
          <div className="grid gap-4">
            <div className="cc-panel grid gap-4 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={task.status} />
                {props.activeRun?.status === "running" ? (
                  <StatusBadge status={props.activeRun.status} />
                ) : null}
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
                  {agent?.name ?? task.agentId}
                </span>
                {(task.scheduledAt ?? task.scheduledFor ?? task.dueAt) ? (
                  <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
                    {formatTimingBadge(task)}
                  </span>
                ) : null}
                {task.sourceTemplateId ? (
                  <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs text-accent">
                    Generated
                    {task.sourceOccurrenceAt ? ` ${formatDate(task.sourceOccurrenceAt)}` : ""}
                  </span>
                ) : null}
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                {task.description || "No description provided."}
              </p>
              {task.latestFinalMessage ? (
                <p className={readResultClassName(readBoardStatus(task))}>
                  {task.latestFinalMessage}
                </p>
              ) : null}
            </div>

            <div className="cc-panel grid gap-3 p-4">
              <h3 className="font-semibold text-text-primary">Recommended action</h3>
              <div className="flex flex-wrap gap-2">
                <TaskPanelPrimaryActions
                  activeRun={props.activeRun}
                  currentSearch={props.currentSearch}
                  onAccept={() => props.onAccept(task)}
                  onArchive={() => props.onArchive(task)}
                  onQueue={() => props.onQueue(task)}
                  onRestore={() => props.onRestore(task)}
                  onReopen={() => props.onReopen(task)}
                  task={task}
                />
              </div>
            </div>

            <article className="cc-panel overflow-hidden p-0">
              <TabBar
                activeTabId={activeSectionId}
                onTabChange={(tabId) => setSelectedSectionId(tabId as DetailSectionId)}
                tabs={DETAIL_SECTION_TABS}
              />
              <div className="p-4">
                <TaskDetailSectionContent
                  activeRun={props.activeRun}
                  agent={agent}
                  isRunsLoading={runsQuery.isLoading}
                  runs={runsQuery.data ?? []}
                  runsError={runsQuery.error}
                  sectionId={activeSectionId}
                  task={task}
                  taskId={task.id}
                  onUpdateContext={(text) => props.onUpdateContext(task, text)}
                  onUploadContextAttachment={(file) => props.onUploadContextAttachment(task, file)}
                />
              </div>
            </article>

            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Todos" value={formatTodoProgress(task)} />
              <Metric label="Updated" value={formatDate(task.updatedAt)} />
              <Metric label="Schedule" value={formatSchedule(task)} />
              <Metric label="Latest run" value={task.latestRunId ?? "No runs yet"} />
            </div>
          </div>
        ) : null}
      </div>

      {task ? (
        <div className="flex flex-wrap gap-2 border-t border-border bg-surface-elevated p-4 sm:p-5">
          <Link
            className="cc-button"
            to={`/tasks/${task.id}${buildFullPageSearch(props.currentSearch)}`}
          >
            Open full page
          </Link>
          <Link
            className="cc-button cc-button-secondary"
            to={`/tasks/${task.id}/edit${buildFullPageSearch(props.currentSearch)}`}
          >
            Edit
          </Link>
          <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
            Back to board
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function TaskPanelPrimaryActions(props: {
  task: Task;
  activeRun?: TaskRun;
  currentSearch: string;
  onAccept: () => void;
  onArchive: () => void;
  onQueue: () => void;
  onRestore: () => void;
  onReopen: () => void;
}) {
  const status = readBoardStatus(props.task);

  if (props.task.archived || status === "archived") {
    return (
      <button className="cc-button" onClick={props.onRestore} type="button">
        Restore
      </button>
    );
  }

  if (status === "queued" && props.activeRun) {
    return (
      <Link
        className="cc-button"
        to={`/tasks/${props.task.id}/runs/${props.activeRun.id}${props.currentSearch}`}
      >
        {props.activeRun.status === "running" ? "View active run" : "View queued run"}
      </Link>
    );
  }

  if (status === "ready_to_check") {
    return (
      <button className="cc-button" onClick={props.onAccept} type="button">
        Accept
      </button>
    );
  }

  if (status === "review") {
    return (
      <button className="cc-button" onClick={props.onQueue} type="button">
        Retry
      </button>
    );
  }

  if (status === "done") {
    return (
      <>
        <button className="cc-button" onClick={props.onArchive} type="button">
          Archive
        </button>
        <button className="cc-button cc-button-secondary" onClick={props.onReopen} type="button">
          Reopen
        </button>
      </>
    );
  }

  return (
    <button className="cc-button" onClick={props.onQueue} type="button">
      {status === "scheduled" ? "Queue now" : "Queue"}
    </button>
  );
}

function TaskDetailSectionContent(props: {
  sectionId: DetailSectionId;
  task: Task;
  taskId: string;
  agent?: Agent;
  activeRun?: TaskRun;
  runs: TaskRun[];
  isRunsLoading: boolean;
  runsError: unknown;
  onUpdateContext: (text: string) => void;
  onUploadContextAttachment: (file: File) => void;
}) {
  if (props.sectionId === "overview") {
    return (
      <div className="grid gap-4">
        <TextBlock
          label="Description"
          value={props.task.description || "No description provided."}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="Status" value={formatToken(readBoardStatus(props.task))} />
          <Metric label="Agent" value={props.agent?.name ?? props.task.agentId} />
          <Metric label="Schedule" value={formatSchedule(props.task)} />
          <Metric label="Source" value={formatSourceTemplate(props.task)} />
        </div>
        <TaskTodos task={props.task} />
      </div>
    );
  }

  if (props.sectionId === "feedback") {
    return (
      <DecisionSection
        description={
          readBoardStatus(props.task) === "review"
            ? "Add the missing direction here before retrying this task. Comment editing arrives in the feedback epic."
            : "Feedback comments and follow-up instructions that affect future runs will appear here."
        }
        title={readBoardStatus(props.task) === "review" ? "Feedback needed" : "No feedback yet"}
      />
    );
  }

  if (props.sectionId === "subtasks") {
    return (
      <DecisionSection
        description="Lightweight work breakdown under this parent task will appear here in the subtasks epic."
        title="No subtasks yet"
      />
    );
  }

  if (props.sectionId === "runs") {
    return (
      <TaskRunsSection
        activeRun={props.activeRun}
        error={props.runsError}
        isLoading={props.isRunsLoading}
        runs={props.runs}
        task={props.task}
        taskId={props.taskId}
      />
    );
  }

  if (props.sectionId === "context") {
    return (
      <TaskContextSection
        onUpdate={props.onUpdateContext}
        onUpload={props.onUploadContextAttachment}
        task={props.task}
      />
    );
  }

  return <TaskActivitySection runs={props.runs} task={props.task} />;
}

function TaskRunsSection(props: {
  task: Task;
  taskId: string;
  runs: TaskRun[];
  activeRun?: TaskRun;
  isLoading: boolean;
  error: unknown;
}) {
  return (
    <div className="grid gap-4">
      {props.task.latestFinalMessage ? (
        <p className={readResultClassName(readBoardStatus(props.task))}>
          {props.task.latestFinalMessage}
        </p>
      ) : null}
      {props.activeRun ? (
        <Link className="cc-button w-fit" to={`/tasks/${props.taskId}/runs/${props.activeRun.id}`}>
          {props.activeRun.status === "running" ? "View active run" : "View queued run"}
        </Link>
      ) : null}
      <RunHistory
        taskId={props.taskId}
        runs={props.runs}
        isLoading={props.isLoading}
        error={props.error}
      />
    </div>
  );
}

function TaskContextSection(props: {
  task: Task;
  onUpdate: (text: string) => void;
  onUpload: (file: File) => void;
}) {
  const [text, setText] = useState(props.task.context.text ?? "");

  useEffect(() => {
    setText(props.task.context.text ?? "");
  }, [props.task.context.text]);

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file) {
      props.onUpload(file);
    }
  }

  return (
    <div className="grid gap-4">
      <label className="grid gap-2 text-sm text-text-secondary">
        Task context
        <textarea
          className="cc-input min-h-40 resize-y"
          onChange={(event) => setText(event.target.value)}
          placeholder="Optional persistent context for future task runs..."
          value={text}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="cc-button" onClick={() => props.onUpdate(text)} type="button">
          Save context
        </button>
        <label className="cc-button cc-button-secondary cursor-pointer">
          Add attachment
          <input
            accept=".txt,.md,.csv,.json,.pdf,.png,.jpg,.jpeg,.webp,.gif"
            className="sr-only"
            onChange={handleUpload}
            type="file"
          />
        </label>
      </div>
      {props.task.context.attachments.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="font-semibold text-text-primary">Attachments</h3>
          <ul className="grid gap-2">
            {props.task.context.attachments.map((attachment) => (
              <li
                className="rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary"
                key={attachment.id}
              >
                <a
                  className="font-medium text-accent underline-offset-4 hover:underline"
                  href={buildTaskContextAttachmentHref(attachment.storageKey)}
                  rel="noreferrer"
                  target="_blank"
                >
                  {attachment.filename}
                </a>{" "}
                · {attachment.mimeType} · {formatBytes(attachment.sizeBytes)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-text-secondary">No context attachments yet.</p>
      )}
    </div>
  );
}

function TaskActivitySection(props: { task: Task; runs: TaskRun[] }) {
  const latestRun = props.runs[0];

  return (
    <div className="grid gap-3 text-sm text-text-secondary">
      <ActivityItem label="Created" value={formatDate(props.task.createdAt)} />
      <ActivityItem label="Updated" value={formatDate(props.task.updatedAt)} />
      {props.task.doneAt ? (
        <ActivityItem label="Accepted" value={formatDate(props.task.doneAt)} />
      ) : null}
      {props.task.archivedAt ? (
        <ActivityItem label="Archived" value={formatDate(props.task.archivedAt)} />
      ) : null}
      {props.task.sourceOccurrenceAt ? (
        <ActivityItem label="Generated" value={formatDate(props.task.sourceOccurrenceAt)} />
      ) : null}
      {latestRun ? (
        <ActivityItem label="Latest run" value={latestRun.finalMessage ?? latestRun.status} />
      ) : null}
    </div>
  );
}

function TaskTodos(props: { task: Task }) {
  if (props.task.todos.length === 0) {
    return <p className="text-sm text-text-secondary">No todo items.</p>;
  }

  return (
    <div>
      <h3 className="font-semibold text-text-primary">Todos</h3>
      <ul className="mt-3 grid gap-2">
        {props.task.todos.map((todo) => (
          <li
            className="rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary"
            key={todo.id}
          >
            {todo.status === "completed" ? "[x]" : "[ ]"} {todo.content}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DecisionSection(props: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="font-semibold text-text-primary">{props.title}</h3>
      <p className="mt-2 text-sm leading-6 text-text-secondary">{props.description}</p>
    </div>
  );
}

function ActivityItem(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs uppercase tracking-wide text-text-secondary">{props.label}</p>
      <p className="mt-1 text-text-primary">{props.value}</p>
    </div>
  );
}

function TaskTemplatesView(props: {
  templates: TaskTemplate[];
  agents: Agent[];
  currentSearch: string;
  isCreating: boolean;
  isCreatingBusy: boolean;
  onCancelCreate: () => void;
  onCreate: (input: CreateTaskTemplateInput) => void;
  onCreateTask: (template: TaskTemplate) => void;
  onRunNow: (template: TaskTemplate) => void;
  onDelete: (template: TaskTemplate) => void;
  onSelect: (template: TaskTemplate) => void;
  onStartCreate: () => void;
}) {
  const content = props.isCreating ? (
    <TaskTemplateCreateForm
      agents={props.agents}
      isBusy={props.isCreatingBusy}
      onCancel={props.onCancelCreate}
      onSubmit={props.onCreate}
    />
  ) : null;

  if (props.templates.length === 0) {
    if (props.isCreating) {
      return <div className="grid gap-4">{content}</div>;
    }

    return (
      <div className="grid gap-4">
        <EmptyState
          action={
            <button className="cc-button" onClick={props.onStartCreate} type="button">
              Create template
            </button>
          }
          description="Templates store reusable task setup. Add repetition only when the template should run on a schedule."
          title="No task templates yet"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {content}
      <section className="grid gap-4 xl:grid-cols-2">
        {props.templates.map((template) => {
          const agent = props.agents.find((entry) => entry.id === template.defaultAgentId);
          return (
            <article className="cc-panel grid gap-4 p-5" key={template.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <button
                    className="text-left text-xl font-semibold text-text-primary transition hover:text-accent"
                    onClick={() => props.onSelect(template)}
                    type="button"
                  >
                    {template.title}
                  </button>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
                    {template.description || "No description provided."}
                  </p>
                </div>
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-sm text-text-secondary">
                  Template
                </span>
              </div>
              <div className="grid gap-3 text-sm text-text-secondary sm:grid-cols-3">
                <Metric label="Default agent" value={agent?.name ?? template.defaultAgentId} />
                <Metric label="Repeat" value={formatTemplateRepeat(template)} />
                <Metric label="Next task" value={formatDate(template.nextOccurrenceAt)} />
                <Metric
                  label="Last generated"
                  value={formatDate(template.lastGeneratedOccurrenceAt)}
                />
                <Metric label="Latest task" value={template.latestTaskId ?? "None yet"} />
                <Metric label="Timezone" value={template.recurrence?.timezone ?? "Not repeating"} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="cc-button cc-button-secondary"
                  onClick={() => props.onCreateTask(template)}
                  type="button"
                >
                  Create task
                </button>
                <button
                  className="cc-button"
                  onClick={() => props.onRunNow(template)}
                  type="button"
                >
                  Run now
                </button>
                <button
                  className="cc-button cc-button-secondary"
                  onClick={() => props.onSelect(template)}
                  type="button"
                >
                  View details
                </button>
                {template.latestTaskId ? (
                  <Link
                    className="cc-button cc-button-secondary"
                    to={`/tasks/${template.latestTaskId}${props.currentSearch}`}
                  >
                    Open latest task
                  </Link>
                ) : null}
                <button
                  className="cc-button cc-button-secondary"
                  onClick={() => props.onDelete(template)}
                  type="button"
                >
                  Delete template
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function TaskTemplateCreateForm(props: {
  agents: Agent[];
  isBusy: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateTaskTemplateInput) => void;
}) {
  const [form, setForm] = useState<FormState>(() => ({
    agentId: "",
    title: "",
    prompt: createTaskPromptValue(),
    triggerMode: "recurring",
    runAtLocal: "",
    anchorAtLocal: toLocalDateTime(new Date().toISOString()),
    timezone: readLocalTimezone(),
    repeatPreset: "weekly",
    repeatFrequency: "week",
    repeatInterval: "1",
    repeatWeekdays: [1],
    repeatEnabled: false,
    todosText: "",
  }));

  return (
    <form
      className="cc-panel grid gap-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit(formToTemplateInput(form));
      }}
    >
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Create task template</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Templates store reusable task setup. Create a task from a template manually, run it
          immediately, or enable repeating.
        </p>
      </div>
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
          Default agent
          <select
            className="cc-input"
            required
            value={form.agentId}
            onChange={(event) => updateForm({ agentId: event.target.value })}
          >
            <option value="">Select an agent</option>
            {props.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-sm text-text-secondary">
        Task prompt
        <textarea
          className="cc-input min-h-28 resize-y"
          value={form.prompt.text}
          onChange={(event) => updateForm({ prompt: createTaskPromptValue(event.target.value) })}
        />
      </label>
      <section className="grid min-w-0 gap-3 rounded-xl border border-border bg-surface p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <input
            checked={form.repeatEnabled}
            onChange={(event) => updateForm({ repeatEnabled: event.target.checked })}
            type="checkbox"
          />
          Repeat on a schedule
        </label>
        {form.repeatEnabled ? (
          <>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
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
                First occurrence
                <input
                  className="cc-input min-w-0"
                  type="datetime-local"
                  value={form.anchorAtLocal}
                  onChange={(event) => updateForm({ anchorAtLocal: event.target.value })}
                />
              </label>
            </div>
            {form.repeatPreset === "custom" ? (
              <div className="grid gap-3 sm:grid-cols-2">
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
          </>
        ) : (
          <p className="text-sm text-text-secondary">
            Repetition is off. This template will only create tasks when you choose Create task or
            Run now.
          </p>
        )}
      </section>
      <label className="grid gap-1 text-sm text-text-secondary">
        Todo items, one per line
        <textarea
          className="cc-input min-h-24 resize-y"
          value={form.todosText}
          onChange={(event) => updateForm({ todosText: event.target.value })}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="cc-button" disabled={props.isBusy} type="submit">
          Create template
        </button>
        <button className="cc-button cc-button-secondary" onClick={props.onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );

  function updateForm(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }
}

function TaskTemplateDetailPanel(props: {
  templateId: string;
  agents: Agent[];
  currentSearch: string;
  onClose: () => void;
  onCreateTask: (template: TaskTemplate) => void;
  onOpenTask: (taskId: string) => void;
  onRunNow: (template: TaskTemplate) => void;
  onDelete: (template: TaskTemplate) => void;
}) {
  const templateQuery = useTaskTemplateQuery(props.templateId);
  const tasksQuery = useTaskTemplateTasksQuery(props.templateId);
  const template = templateQuery.data;
  const agent = template
    ? props.agents.find((entry) => entry.id === template.defaultAgentId)
    : undefined;
  const error = readError(templateQuery.error ?? tasksQuery.error);

  return (
    <aside
      aria-label="Task template detail panel"
      className="fixed inset-y-0 right-0 z-40 grid w-full grid-rows-[auto_1fr] border-l border-border bg-surface-elevated shadow-2xl sm:max-w-2xl"
    >
      <header className="flex items-start justify-between gap-4 border-b border-border bg-surface-elevated p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary">Task template</p>
          <h2 className="mt-1 text-xl font-semibold text-text-primary">
            {template?.title ?? "Loading template"}
          </h2>
        </div>
        <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
          Back to templates
        </button>
      </header>
      <div className="overflow-auto bg-surface-elevated p-4">
        {templateQuery.isLoading ? <LoadingState testId="task-template-panel-loading" /> : null}
        {error ? <ErrorState description={error} title="Template could not be loaded." /> : null}
        {template ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-surface px-2 py-1 text-xs text-text-secondary">
                {formatTemplateRepeat(template)}
              </span>
            </div>
            <TextBlock
              label="Description"
              value={template.description || "No description provided."}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Default agent" value={agent?.name ?? template.defaultAgentId} />
              <Metric label="Next occurrence" value={formatDate(template.nextOccurrenceAt)} />
              <Metric
                label="Previous occurrence"
                value={formatDate(template.lastGeneratedOccurrenceAt)}
              />
              <Metric label="Timezone" value={template.recurrence?.timezone ?? "Not repeating"} />
            </div>
            <TaskTodos task={templateAsTask(template)} />
            <div className="flex flex-wrap gap-2">
              <button
                className="cc-button cc-button-secondary"
                onClick={() => props.onCreateTask(template)}
                type="button"
              >
                Create task
              </button>
              <button className="cc-button" onClick={() => props.onRunNow(template)} type="button">
                Run now
              </button>
              {template.latestTaskId ? (
                <button
                  className="cc-button cc-button-secondary"
                  onClick={() => props.onOpenTask(template.latestTaskId ?? "")}
                  type="button"
                >
                  Open latest task
                </button>
              ) : null}
              <button
                className="cc-button cc-button-secondary"
                onClick={() => props.onDelete(template)}
                type="button"
              >
                Delete template
              </button>
            </div>
            <GeneratedTaskHistory
              currentSearch={props.currentSearch}
              error={tasksQuery.error}
              isLoading={tasksQuery.isLoading}
              onOpenTask={props.onOpenTask}
              tasks={tasksQuery.data ?? []}
            />
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function GeneratedTaskHistory(props: {
  tasks: Task[];
  currentSearch: string;
  isLoading: boolean;
  error: unknown;
  onOpenTask: (taskId: string) => void;
}) {
  if (props.isLoading) return <LoadingState testId="template-generated-tasks-loading" />;
  if (props.error) {
    return (
      <ErrorState
        description={readError(props.error) ?? "Unknown error"}
        title="Generated tasks could not be loaded."
      />
    );
  }
  if (props.tasks.length === 0) {
    return (
      <EmptyState
        description="Scheduled occurrences and Run Now results will appear here after the template generates tasks."
        title="No generated tasks yet"
      />
    );
  }

  return (
    <section className="grid gap-3">
      <h3 className="font-semibold text-text-primary">Generated tasks</h3>
      {props.tasks.map((task) => (
        <article className="rounded-xl border border-border bg-surface p-4" key={task.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <button
                className="text-left font-semibold text-text-primary transition hover:text-accent"
                onClick={() => props.onOpenTask(task.id)}
                type="button"
              >
                {task.title}
              </button>
              <p className="mt-1 text-sm text-text-secondary">{formatSourceTemplate(task)}</p>
            </div>
            <StatusBadge status={readBoardStatus(task)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              className="cc-button cc-button-secondary"
              to={`/tasks/${task.id}${props.currentSearch}`}
            >
              Open full page
            </Link>
            {task.latestFinalMessage ? (
              <span className="rounded-full border border-border bg-background px-2 py-1 text-xs text-text-secondary">
                {task.latestFinalMessage}
              </span>
            ) : null}
          </div>
        </article>
      ))}
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
  repeatEnabled: boolean;
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
    repeatEnabled: task?.schedule.mode === "recurring",
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

function formToTemplateInput(form: FormState): CreateTaskTemplateInput {
  const input: CreateTaskTemplateInput = {
    defaultAgentId: form.agentId,
    title: form.title,
    description: buildTaskPromptText(form.prompt),
    todos: form.todosText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((content) => ({ content })),
    enabled: true,
  };

  if (form.repeatEnabled) {
    input.recurrence = {
      mode: "recurring",
      anchorAt: new Date(form.anchorAtLocal || Date.now()).toISOString(),
      timezone: form.timezone || readLocalTimezone(),
      repeatRule: buildRepeatRule(form),
    };
  }

  return input;
}

function templateAsTask(template: TaskTemplate): Task {
  return {
    id: template.id,
    agentId: template.defaultAgentId,
    defaultAgentId: template.defaultAgentId,
    templateId: template.id,
    title: template.title,
    description: template.description,
    context: { attachments: [] },
    todos: template.todos,
    status: "backlog",
    triggerMode: template.recurrence ? "recurring" : "manual",
    schedule: template.recurrence ?? { mode: "manual" },
    enabled: template.enabled,
    archived: template.archived,
    latestFinalMessage: template.latestFinalMessage,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    archivedAt: template.archivedAt,
  };
}

function buildTaskContextAttachmentHref(storageKey: string): string {
  return buildFileManagerHref({
    root: "workspace",
    path: `task-context-attachments/${storageKey}`,
    openInEditor: true,
  });
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

function setSelectedTask(
  params: URLSearchParams,
  setSearchParams: (params: URLSearchParams) => void,
  taskId: string,
) {
  const next = new URLSearchParams(params);
  next.set("task", taskId);
  setSearchParams(next);
}

function clearSelectedTask(
  params: URLSearchParams,
  setSearchParams: (params: URLSearchParams) => void,
) {
  const next = new URLSearchParams(params);
  next.delete("task");
  setSearchParams(next);
}

function setSelectedTemplate(
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

function clearSelectedTemplate(
  params: URLSearchParams,
  setSearchParams: (params: URLSearchParams) => void,
) {
  const next = new URLSearchParams(params);
  next.delete("template");
  setSearchParams(next);
}

function selectGeneratedTask(
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

function buildPanelSearch(currentSearch: string, taskId: string): string {
  const params = new URLSearchParams(
    currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch,
  );
  params.set("task", taskId);
  const next = params.toString();
  return next ? `?${next}` : "";
}

function buildFullPageSearch(currentSearch: string): string {
  const params = new URLSearchParams(
    currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch,
  );
  params.delete("task");
  const next = params.toString();
  return next ? `?${next}` : "";
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

  return `grid min-w-0 max-w-full gap-3 rounded-xl border p-4 ${emphasis}`;
}

function readResultClassName(status: BoardTaskStatus): string {
  const emphasis =
    status === "ready_to_check"
      ? "border-accent/30 bg-accent/10 text-text-primary"
      : status === "review"
        ? "border-amber-400/30 bg-amber-400/10 text-text-primary"
        : "border-border bg-background text-text-secondary";

  return `min-w-0 break-words [overflow-wrap:anywhere] rounded-lg border p-3 text-sm leading-6 ${emphasis}`;
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

function formatBytes(value: number): string {
  if (value < 1024) return `${String(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
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

function getDefaultDetailSection(task?: Task): DetailSectionId {
  if (!task) return "overview";
  const status = readBoardStatus(task);

  if (status === "queued" || status === "ready_to_check") return "runs";
  if (status === "review") return "feedback";
  if (status === "done") return "activity";
  return "overview";
}

function formatSourceTemplate(task: Task): string {
  if (!task.sourceTemplateId) return "User-created task";
  return task.sourceOccurrenceAt
    ? `Generated ${formatDate(task.sourceOccurrenceAt)}`
    : "Generated from template";
}

function formatTemplateRepeat(template: TaskTemplate): string {
  return template.recurrence
    ? formatRepeatSummary(template.recurrence.repeatRule)
    : "Manual template";
}

function formatSchedule(task: Task): string {
  if (task.scheduledAt) return `Scheduled ${formatDate(task.scheduledAt)}`;
  if (task.scheduledFor) return `Scheduled ${formatDate(task.scheduledFor)}`;
  if (task.dueAt) return `Due ${formatDate(task.dueAt)}`;
  if (task.schedule.mode === "scheduled_once") return formatDate(task.schedule.runAt);
  if (task.schedule.mode === "recurring") return formatRepeatSummary(task.schedule.repeatRule);
  return "Manual only";
}

function RunHistory(props: {
  taskId: string;
  runs: TaskRun[];
  isLoading: boolean;
  error: unknown;
}) {
  if (props.isLoading) return <LoadingState testId="task-panel-runs-loading" />;
  if (props.error) {
    return (
      <ErrorState
        description={readError(props.error) ?? "Unknown error"}
        title="Runs could not be loaded."
      />
    );
  }
  if (props.runs.length === 0) {
    return (
      <EmptyState
        description="Executions will appear here after this task runs."
        title="No runs yet"
      />
    );
  }

  return (
    <div className="grid gap-2">
      {props.runs.map((run) => (
        <Link
          className="rounded-lg border border-border bg-surface p-3 text-sm transition hover:border-accent/40"
          key={run.id}
          to={`/tasks/${props.taskId}/runs/${run.id}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={run.status} />
            <span className="text-text-secondary">{formatToken(run.triggerSource)}</span>
          </div>
          <p className="mt-2 truncate text-text-secondary">
            {run.finalMessage ?? run.errorMessage ?? "No summary"}
          </p>
        </Link>
      ))}
    </div>
  );
}

function TextBlock(props: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-text-secondary">{props.label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-primary">{props.value}</p>
    </div>
  );
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
