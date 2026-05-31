import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  Archive,
  CalendarClock,
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  Flag,
  Info,
  MessageSquareText,
  Pencil,
  Play,
  RotateCcw,
  Save,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type {
  Agent,
  AgentCatalog,
  BoardTaskStatus,
  CreateTaskFeedbackInput,
  CreateTaskInput,
  CreateTaskTemplateInput,
  Task,
  TaskFeedbackThread,
  TaskQueuePreview,
  TaskRun,
  TaskSubtaskProgress,
  TaskSubtask,
  TaskTemplate,
  TaskRepeatRule,
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
  useTaskFeedbackQuery,
  useTaskQuery,
  useTaskTemplateQuery,
  useTaskTemplateTasksQuery,
  useTaskRunsQuery,
  useTaskSubtaskProgressQuery,
  useTaskSubtasksQuery,
  useTasksQuery,
  useTaskTemplatesQuery,
} from "@/hooks/use-tasks-query";
import { buildFileManagerHref } from "@/lib/file-manager-href";
import { isTaskCreationPrefill, type TaskCreationPrefill } from "@/services/task-prefill-service";

type TasksPageProps = {
  mode?: "list" | "create" | "edit";
};

type DetailSectionId = "overview" | "feedback" | "subtasks" | "runs" | "context" | "activity";

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
    status: "review",
    title: "Review",
    description: "Tasks that failed, need a decision, or need feedback before retry.",
    empty: "Failures and human-review requests appear here.",
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
          onSaveAsTemplate={(task) => {
            mutations.createTemplate.mutate(
              {
                defaultAgentId: task.defaultAgentId ?? task.agentId,
                title: task.title,
                description: task.description,
                todos: task.todos.map((todo) => ({ content: todo.content, status: todo.status })),
                permissionProfile: task.permissionProfile,
                enabled: true,
              },
              {
                onSuccess: (template) => {
                  setSelectedTemplate(searchParams, setSearchParams, template.id);
                },
              },
            );
          }}
          onMove={(task, status) => handleBoardMove(task, status)}
          onQueue={(task) => mutations.trigger.mutate({ id: task.id })}
          onReview={(task) =>
            void mutations.update.mutate({ id: task.id, input: { status: "review" } })
          }
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

  function handleBoardMove(task: Task, status: BoardTaskStatus) {
    const activeRun = activeRuns.find((run) => run.taskId === task.id);
    const currentStatus = readBoardStatus(task);

    if (status === currentStatus) return;
    if (activeRun || currentStatus === "queued") return;

    if (status === "queued") {
      mutations.trigger.mutate({ id: task.id });
      return;
    }

    if (status === "done") {
      if (currentStatus === "ready_to_check" || currentStatus === "review") {
        mutations.accept.mutate(task.id);
      }
      return;
    }

    mutations.update.mutate({ id: task.id, input: { status } });
  }
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
  onSaveAsTemplate: (task: Task) => void;
  onMove: (task: Task, status: BoardTaskStatus) => void;
  onQueue: (task: Task) => void;
  onReview: (task: Task) => void;
  onReopen: (task: Task) => void;
  onSelect: (task: Task) => void;
}) {
  const [draggedTaskId, setDraggedTaskId] = useState<string>();
  const [dragOverStatus, setDragOverStatus] = useState<BoardTaskStatus>();
  const draggedTask = props.tasks.find((task) => task.id === draggedTaskId);
  const progressQuery = useTaskSubtaskProgressQuery(props.tasks.map((task) => task.id));
  const progressByTaskId = new Map(
    (progressQuery.data ?? []).map((entry) => [entry.taskId, entry]),
  );

  return (
    <section className="overflow-x-auto pb-3" data-testid="tasks-board">
      <div className="flex min-w-max gap-4">
        {BOARD_COLUMNS.map((column) => {
          const columnTasks = props.tasks.filter((task) => readBoardStatus(task) === column.status);

          if (column.status === "review" && columnTasks.length === 0) {
            return null;
          }

          return (
            <div
              className={readColumnClassName(
                draggedTask,
                column.status,
                props.activeRuns,
                dragOverStatus === column.status,
              )}
              data-board-status={column.status}
              data-drop-state={readColumnDropState(
                draggedTask,
                column.status,
                props.activeRuns,
                dragOverStatus === column.status,
              )}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDragOverStatus(undefined);
                }
              }}
              onDragOver={(event) => {
                if (
                  draggedTask &&
                  canDropTaskOnStatus(draggedTask, column.status, props.activeRuns)
                ) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverStatus(column.status);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const task = props.tasks.find(
                  (entry) => entry.id === event.dataTransfer.getData("text/plain"),
                );

                if (task && canDropTaskOnStatus(task, column.status, props.activeRuns)) {
                  props.onMove(task, column.status);
                }

                setDraggedTaskId(undefined);
                setDragOverStatus(undefined);
              }}
              key={column.status}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <h2 className="font-semibold text-text-primary">{column.title}</h2>
                    <ColumnDescriptionTooltip
                      title={column.title}
                      description={column.description}
                    />
                  </div>
                  <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-text-secondary">
                    {columnTasks.length}
                  </span>
                </div>
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
                    onDragEnd={() => {
                      setDraggedTaskId(undefined);
                      setDragOverStatus(undefined);
                    }}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", task.id);
                      setDraggedTaskId(task.id);
                      setDragOverStatus(undefined);
                    }}
                    onDuplicate={() => props.onDuplicate(task)}
                    onSaveAsTemplate={() => props.onSaveAsTemplate(task)}
                    onQueue={() => props.onQueue(task)}
                    onReview={() => props.onReview(task)}
                    onReopen={() => props.onReopen(task)}
                    onSelect={() => props.onSelect(task)}
                    progress={progressByTaskId.get(task.id)}
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
  progress?: TaskSubtaskProgress;
  currentSearch: string;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onAccept: () => void;
  onQueue: () => void;
  onReview: () => void;
  onCancelRun: (run: TaskRun) => void;
  onDuplicate: () => void;
  onSaveAsTemplate: () => void;
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
    <article
      className={readCardClassName(boardStatus, !props.activeRun)}
      draggable={!props.activeRun}
      onDragEnd={props.onDragEnd}
      onDragStart={props.onDragStart}
    >
      <div className="grid gap-2">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <Link
            className="min-w-0 break-words [overflow-wrap:anywhere] font-semibold leading-6 text-text-primary transition hover:text-accent"
            to={`/tasks${buildPanelSearch(props.currentSearch, task.id)}`}
            onClick={props.onSelect}
          >
            {task.title}
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {task.latestFinalMessage ? (
              <TaskResultMessageTooltip message={task.latestFinalMessage} />
            ) : null}
            <BoardAssigneeAvatar agent={props.agent} fallbackName={task.agentId} />
          </div>
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

      <TaskBoardCardMeta progress={props.progress} task={task} />

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
          onSaveAsTemplate={props.onSaveAsTemplate}
          onQueue={props.onQueue}
          onReview={props.onReview}
          onReopen={props.onReopen}
          onSelect={props.onSelect}
          task={task}
        />
      </div>
    </article>
  );
}

function ColumnDescriptionTooltip(props: { title: string; description: string }) {
  return (
    <span className="group relative inline-flex shrink-0" tabIndex={0}>
      <Info
        aria-label={`${props.title} info`}
        className="h-4 w-4 rounded-full text-text-secondary transition group-hover:text-accent group-focus-visible:text-accent"
      />
      <span
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-md border border-border bg-surface-elevated px-3 py-2 text-left text-xs leading-5 text-text-primary opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        role="tooltip"
      >
        {props.description}
      </span>
    </span>
  );
}

function TaskResultMessageTooltip(props: { message: string }) {
  return (
    <span className="group relative inline-flex shrink-0" tabIndex={0}>
      <span
        aria-label="Latest result message"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface-elevated text-text-secondary transition group-hover:border-accent/50 group-hover:text-accent group-focus-visible:border-accent/50 group-focus-visible:text-accent"
      >
        <MessageSquareText aria-hidden="true" className="h-3.5 w-3.5" />
      </span>
      <span
        className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-64 rounded-md border border-border bg-surface-elevated px-3 py-2 text-left text-xs leading-5 text-text-primary opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        role="tooltip"
      >
        {formatResultMessagePreview(props.message)}
      </span>
    </span>
  );
}

function TaskBoardCardMeta(props: { task: Task; progress?: TaskSubtaskProgress }) {
  const totalTodos = props.task.todos.length;
  const completedTodos = props.task.todos.filter((todo) => todo.status === "completed").length;

  if (totalTodos === 0 && !props.progress?.subtasks.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
      {totalTodos > 0 ? (
        <span
          aria-label={`Todos: ${completedTodos}/${totalTodos}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1"
        >
          <CheckCheck aria-hidden="true" className="h-3.5 w-3.5 text-accent" />
          <span>{`${completedTodos}/${totalTodos}`}</span>
        </span>
      ) : null}
      {props.progress?.subtasks.length ? (
        <span
          aria-label="Subtasks"
          className="inline-flex items-center -space-x-1.5 py-1 group-hover/card:space-x-1"
        >
          {props.progress.subtasks.map((subtask) => (
            <TaskSubtaskDot key={subtask.id} subtask={subtask} />
          ))}
        </span>
      ) : null}
    </div>
  );
}

function TaskSubtaskDot(props: { subtask: TaskSubtaskProgress["subtasks"][number] }) {
  return (
    <span
      className="group relative inline-flex transition-[margin] duration-150 ease-out"
      tabIndex={0}
    >
      <span
        aria-label={formatSubtaskDotLabel(props.subtask.description)}
        className={readSubtaskDotClassName(props.subtask.status)}
      />
      <span
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-left text-xs leading-5 text-text-primary opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        role="tooltip"
      >
        {formatSubtaskPreview(props.subtask.description)}
      </span>
    </span>
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
  onSaveAsTemplate: () => void;
  onQueue: () => void;
  onReview: () => void;
  onReopen: () => void;
  onSelect: () => void;
}) {
  if (props.boardStatus === "queued") {
    return (
      <>
        {props.activeRunPath ? (
          <TaskCardIconLink icon={ExternalLink} label="View run" to={props.activeRunPath} />
        ) : null}
        {props.activeRun ? (
          <TaskCardIconButton
            icon={XCircle}
            label="Cancel run"
            onClick={() => {
              if (props.activeRun) props.onCancelRun(props.activeRun);
            }}
            variant="danger"
          />
        ) : null}
        {!props.activeRun ? (
          <TaskCardIconButton icon={Play} label="Queue" onClick={props.onQueue} variant="success" />
        ) : null}
        <TaskCardIconLink
          icon={Info}
          label="Details"
          to={`/tasks${buildPanelSearch(props.currentSearch, props.task.id)}`}
          onClick={props.onSelect}
        />
        <TaskCardIconButton icon={Save} label="Save as template" onClick={props.onSaveAsTemplate} />
      </>
    );
  }

  if (props.boardStatus === "ready_to_check") {
    return (
      <>
        <TaskCardIconButton
          icon={Check}
          label="Accept"
          onClick={props.onAccept}
          variant="success"
        />
        <TaskCardIconButton icon={Flag} label="Review" onClick={props.onReview} variant="warning" />
        {props.latestRunPath ? (
          <TaskCardIconLink icon={ExternalLink} label="Open run" to={props.latestRunPath} />
        ) : null}
        <TaskCardIconLink
          icon={Info}
          label="Details"
          to={`/tasks${buildPanelSearch(props.currentSearch, props.task.id)}`}
          onClick={props.onSelect}
        />
        <TaskCardIconButton icon={Save} label="Save as template" onClick={props.onSaveAsTemplate} />
      </>
    );
  }

  if (props.boardStatus === "review") {
    return (
      <>
        <TaskCardIconButton
          icon={RotateCcw}
          label="Retry"
          onClick={props.onQueue}
          variant="warning"
        />
        {props.latestRunPath ? (
          <TaskCardIconLink icon={ExternalLink} label="Open run" to={props.latestRunPath} />
        ) : null}
        <TaskCardIconLink
          icon={Pencil}
          label="Edit"
          to={`/tasks/${props.task.id}/edit${props.currentSearch}`}
        />
        <TaskCardIconButton icon={Save} label="Save as template" onClick={props.onSaveAsTemplate} />
      </>
    );
  }

  if (props.boardStatus === "done") {
    return (
      <>
        <TaskCardIconButton icon={RotateCcw} label="Reopen" onClick={props.onReopen} />
        <TaskCardIconButton
          icon={Archive}
          label="Archive"
          onClick={props.onArchive}
          variant="warning"
        />
        <TaskCardIconLink
          icon={Info}
          label="Details"
          to={`/tasks${buildPanelSearch(props.currentSearch, props.task.id)}`}
          onClick={props.onSelect}
        />
        <TaskCardIconButton icon={Save} label="Save as template" onClick={props.onSaveAsTemplate} />
      </>
    );
  }

  return (
    <>
      <TaskCardIconButton
        icon={Play}
        label={props.boardStatus === "scheduled" ? "Queue now" : "Queue"}
        onClick={props.onQueue}
        variant="success"
      />
      <TaskCardIconLink
        icon={props.boardStatus === "scheduled" ? CalendarClock : Pencil}
        label={props.boardStatus === "scheduled" ? "Reschedule" : "Edit"}
        to={`/tasks/${props.task.id}/edit${props.currentSearch}`}
      />
      <TaskCardIconButton icon={Copy} label="Duplicate" onClick={props.onDuplicate} />
      <TaskCardIconButton icon={Save} label="Save as template" onClick={props.onSaveAsTemplate} />
      <TaskCardIconButton
        icon={Archive}
        label="Archive"
        onClick={props.onArchive}
        variant="warning"
      />
    </>
  );
}

type TaskCardIconActionVariant = "normal" | "success" | "warning" | "danger";

function TaskCardIconButton(props: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: TaskCardIconActionVariant;
}) {
  const Icon = props.icon;

  return (
    <button
      aria-label={props.label}
      className={readTaskCardIconActionClassName(props.variant)}
      onClick={props.onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      <TaskCardIconActionTooltip label={props.label} />
    </button>
  );
}

function TaskCardIconLink(props: {
  icon: LucideIcon;
  label: string;
  to: string;
  onClick?: () => void;
  variant?: TaskCardIconActionVariant;
}) {
  const Icon = props.icon;

  return (
    <Link
      aria-label={props.label}
      className={readTaskCardIconActionClassName(props.variant)}
      onClick={props.onClick}
      to={props.to}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      <TaskCardIconActionTooltip label={props.label} />
    </Link>
  );
}

function TaskCardIconActionTooltip(props: { label: string }) {
  return (
    <span
      className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-max max-w-48 -translate-x-1/2 whitespace-normal rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs font-medium text-text-primary opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      role="tooltip"
    >
      {props.label}
    </span>
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
  const mutations = useTaskMutations();
  const [selectedSectionId, setSelectedSectionId] = useState<DetailSectionId>();
  const [queuePreview, setQueuePreview] = useState<TaskQueuePreview>();
  const task = taskQuery.data;
  const agent = props.agents.find((entry) => entry.id === task?.agentId);
  const activeSectionId = selectedSectionId ?? getDefaultDetailSection(task);

  return (
    <aside
      aria-label="Task detail panel"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl min-w-0 flex-col overflow-hidden border-l border-border bg-surface-elevated shadow-2xl lg:top-0"
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

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-surface-elevated p-4 sm:p-5">
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
          <div className="grid min-w-0 gap-4">
            <div className="cc-panel grid min-w-0 gap-4 overflow-hidden p-4">
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
              <p className="min-w-0 break-words text-sm leading-6 text-text-secondary [overflow-wrap:anywhere]">
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
                <button
                  className="cc-button cc-button-secondary"
                  onClick={() => {
                    mutations.previewQueue.mutate(
                      { id: task.id },
                      { onSuccess: (preview) => setQueuePreview(preview) },
                    );
                  }}
                  type="button"
                >
                  Preview context
                </button>
              </div>
              {queuePreview ? <QueuePreviewSummary preview={queuePreview} /> : null}
            </div>

            <article className="cc-panel overflow-visible p-0">
              <TabBar
                activeTabId={activeSectionId}
                onTabChange={(tabId) => setSelectedSectionId(tabId as DetailSectionId)}
                tabs={DETAIL_SECTION_TABS}
              />
              <div className="p-4">
                <TaskDetailSectionContent
                  activeRun={props.activeRun}
                  agent={agent}
                  agents={props.agents}
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
  agents: Agent[];
  activeRun?: TaskRun;
  runs: TaskRun[];
  isRunsLoading: boolean;
  runsError: unknown;
  onUpdateContext: (text: string) => void;
  onUploadContextAttachment: (file: File) => void;
}) {
  const feedbackQuery = useTaskFeedbackQuery(props.taskId);
  const subtasksQuery = useTaskSubtasksQuery(props.taskId);
  const catalogQuery = useAgentCatalogQuery();
  const mutations = useTaskMutations();
  const feedbackSkills = useTaskComposerSkills(props.agent, catalogQuery.data);
  const isFeedbackSection = props.sectionId === "feedback";
  const isSubtasksSection = props.sectionId === "subtasks";

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

  if (isFeedbackSection) {
    return (
      <TaskFeedbackSection
        agents={props.agents}
        error={feedbackQuery.error}
        feedback={feedbackQuery.data ?? []}
        isLoading={feedbackQuery.isLoading}
        isSubmitting={mutations.createFeedback.isPending}
        skills={feedbackSkills}
        onSubmit={(input) => mutations.createFeedback.mutate({ id: props.taskId, input })}
        task={props.task}
      />
    );
  }

  if (isSubtasksSection) {
    return (
      <TaskSubtasksSection
        agents={props.agents}
        error={subtasksQuery.error}
        isLoading={subtasksQuery.isLoading}
        runs={props.runs}
        taskId={props.taskId}
        subtasks={subtasksQuery.data ?? []}
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

function useTaskComposerSkills(
  agent: Agent | undefined,
  catalog: AgentCatalog | undefined,
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

function QueuePreviewSummary(props: { preview: TaskQueuePreview }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-text-primary">Next run context preview</p>
          <p className="text-xs text-text-secondary">
            Agent {props.preview.runAgentId}
            {props.preview.subtask ? ` · subtask ${props.preview.subtask.id}` : " · parent task"}
          </p>
        </div>
        <button
          className="cc-button cc-button-secondary"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open ? (
        <div className="mt-3 grid gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Trusted task content
            </p>
            <pre className="mt-2 max-h-52 overflow-auto rounded-lg border border-border bg-background p-3 text-xs text-text-primary whitespace-pre-wrap">
              {props.preview.renderedPrompt}
            </pre>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Untrusted feedback and history context
            </p>
            <pre className="mt-2 max-h-52 overflow-auto rounded-lg border border-border bg-background p-3 text-xs text-text-primary whitespace-pre-wrap">
              {JSON.stringify(props.preview.renderedContext, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TaskFeedbackSection(props: {
  task: Task;
  agents: Agent[];
  skills: { slug: string; description?: string }[];
  feedback: TaskFeedbackThread[];
  isLoading: boolean;
  error: unknown;
  isSubmitting: boolean;
  onSubmit: (input: CreateTaskFeedbackInput) => void;
}) {
  const [prompt, setPrompt] = useState<TaskPromptValue>(() => createTaskPromptValue());

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = buildTaskPromptText(prompt);

    if (!body) {
      return;
    }

    props.onSubmit({
      body,
      mentionedAgentIds: prompt.mentionedAgents.map((agent) => agent.id),
    });
    setPrompt(createTaskPromptValue());
  }

  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3 rounded-lg border border-border bg-surface p-3"
        onSubmit={handleSubmit}
      >
        <section className="grid gap-2 text-sm text-text-secondary">
          <div>
            <h3 className="font-medium text-text-primary">Feedback</h3>
            <p className="text-xs text-text-secondary">
              Use # for files, / for skills, and @ to mention agents for subtasks.
            </p>
          </div>
          <TaskPromptComposer
            agentId={props.task.agentId}
            agents={props.agents}
            fileSearchAgentId={prompt.mentionedAgents[0]?.id ?? null}
            label="Feedback"
            onChange={setPrompt}
            placeholder="Describe the follow-up work or correction needed."
            skills={props.skills}
            value={prompt}
          />
        </section>
        <p className="text-xs text-text-secondary">
          If no agent is mentioned, feedback creates one subtask for the task default agent.
        </p>
        <button className="cc-button w-fit" disabled={props.isSubmitting} type="submit">
          {props.isSubmitting ? "Adding..." : "Add feedback"}
        </button>
      </form>

      {props.isLoading ? <LoadingState testId="task-feedback-loading" /> : null}
      {props.error ? (
        <ErrorState
          description={readError(props.error) ?? "Request failed."}
          title="Feedback could not be loaded."
        />
      ) : null}
      {!props.isLoading && props.feedback.length === 0 ? (
        <EmptyState
          description="Feedback added here creates agent-assigned subtasks for the next queued run."
          title="No feedback yet"
        />
      ) : null}
      {props.feedback.length > 0 ? (
        <div className="grid gap-3">
          {props.feedback.map((entry) => (
            <article className="rounded-lg border border-border bg-surface p-3" key={entry.id}>
              <p className="text-sm leading-6 text-text-primary">{entry.body}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
                <span>{formatDate(entry.createdAt)}</span>
                <span>
                  {entry.subtasks.length} subtask{entry.subtasks.length === 1 ? "" : "s"}
                </span>
                {entry.targetAgentIds.map((agentId) => (
                  <span className="rounded-full border border-border px-2 py-1" key={agentId}>
                    {readAgentName(props.agents, agentId)}
                  </span>
                ))}
              </div>
              <FeedbackReplies agents={props.agents} subtasks={entry.subtasks} />
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TaskSubtasksSection(props: {
  agents: Agent[];
  subtasks: TaskSubtask[];
  runs: TaskRun[];
  taskId: string;
  isLoading: boolean;
  error: unknown;
}) {
  return (
    <div className="grid gap-4">
      {props.isLoading ? <LoadingState testId="task-subtasks-loading" /> : null}
      {props.error ? (
        <ErrorState
          description={readError(props.error) ?? "Request failed."}
          title="Subtasks could not be loaded."
        />
      ) : null}
      {!props.isLoading && props.subtasks.length === 0 ? (
        <EmptyState
          description="Feedback creates simple subtasks assigned to the mentioned agents."
          title="No subtasks yet"
        />
      ) : null}
      {props.subtasks.length > 0 ? (
        <div className="grid gap-3">
          {props.subtasks.map((subtask) => {
            const subtaskRuns = props.runs.filter((run) => run.subtaskId === subtask.id);
            const latestRun = subtaskRuns[0];

            return (
              <article className="rounded-lg border border-border bg-surface p-3" key={subtask.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-text-primary">
                    {readAgentName(props.agents, subtask.agentId)}
                  </span>
                  <StatusBadge status={latestRun?.status ?? "backlog"} />
                </div>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{subtask.description}</p>
                {subtaskRuns.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {subtaskRuns.map((run) => (
                      <div
                        className="rounded-lg border border-border bg-surface-muted p-3"
                        key={run.id}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                            <StatusBadge status={run.status} />
                            <span>{formatDate(run.completedAt ?? run.updatedAt)}</span>
                          </div>
                          <Link
                            className="font-medium text-accent underline-offset-4 hover:underline"
                            to={`/tasks/${props.taskId}/runs/${run.id}`}
                          >
                            Open run
                          </Link>
                        </div>
                        {run.finalMessage || run.resultText || run.errorMessage ? (
                          <p className="mt-2 text-sm leading-6 text-text-secondary">
                            {run.finalMessage ?? run.resultText ?? run.errorMessage}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FeedbackReplies(props: { agents: Agent[]; subtasks: TaskFeedbackThread["subtasks"] }) {
  const replies = props.subtasks.flatMap((subtask) =>
    subtask.replies.map((reply) => ({ ...reply, agentId: subtask.agentId })),
  );

  if (replies.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 grid gap-2">
      {replies.map((reply) => (
        <div className={readSubtaskReplyClassName(reply.status)} key={reply.run.id}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span>{readAgentName(props.agents, reply.agentId)}</span>
            <StatusBadge status={reply.status} />
            <span>{formatDate(reply.run.completedAt ?? reply.run.updatedAt)}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {reply.run.finalMessage ??
              reply.run.resultText ??
              reply.run.errorMessage ??
              "No result yet."}
          </p>
        </div>
      ))}
    </div>
  );
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
    scheduledAtLocal: "",
    dueAtLocal: "",
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
  const taskSkills = useTaskComposerSkills(selectedAgent, catalogQuery.data);

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
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="grid gap-1 text-sm text-text-secondary">
                  Schedule for
                  <input
                    className="cc-input"
                    type="datetime-local"
                    value={form.scheduledAtLocal}
                    onChange={(event) => updateForm({ scheduledAtLocal: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm text-text-secondary">
                  Due by
                  <input
                    className="cc-input"
                    type="datetime-local"
                    value={form.dueAtLocal}
                    onChange={(event) => updateForm({ dueAtLocal: event.target.value })}
                  />
                </label>
              </div>
              {props.mode === "edit" && task?.scheduledAt ? (
                <button
                  className="cc-button cc-button-secondary w-fit"
                  onClick={() => updateForm({ scheduledAtLocal: "" })}
                  type="button"
                >
                  Clear schedule
                </button>
              ) : null}

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
              mentionedAgents: [],
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
  scheduledAtLocal: string;
  dueAtLocal: string;
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
    scheduledAtLocal: task?.scheduledAt ? toLocalDateTime(task.scheduledAt) : "",
    dueAtLocal: task?.dueAt ? toLocalDateTime(task.dueAt) : "",
    anchorAtLocal: "",
    timezone: readLocalTimezone(),
    repeatPreset: "hourly",
    repeatFrequency: "hour",
    repeatInterval: "1",
    repeatWeekdays: [],
    repeatEnabled: false,
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
  const input: CreateTaskInput | UpdateTaskInput = {
    agentId: form.agentId,
    title: form.title,
    description: buildTaskPromptText(form.prompt),
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
    enabled: template.enabled,
    archived: false,
    latestFinalMessage: template.latestFinalMessage,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function buildTaskContextAttachmentHref(storageKey: string): string {
  return buildFileManagerHref({
    root: "workspace",
    path: `task-context-attachments/${storageKey}`,
    openInEditor: true,
  });
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

function readAgentName(agents: Agent[], agentId: string): string {
  return agents.find((agent) => agent.id === agentId)?.name ?? agentId;
}

function readCardClassName(status: BoardTaskStatus, draggable: boolean): string {
  const emphasis =
    status === "ready_to_check"
      ? "border-accent/40 bg-accent/5"
      : status === "review"
        ? "border-amber-400/40 bg-amber-400/5"
        : status === "queued"
          ? "border-accent/30 bg-surface-elevated"
          : "border-border bg-surface";
  const interaction = draggable
    ? "cursor-grab hover:-translate-y-1 hover:shadow-lg active:cursor-grabbing active:shadow-xl"
    : "cursor-default";

  return `group/card grid min-w-0 max-w-full gap-3 rounded-xl border p-4 transition duration-150 ease-out ${interaction} ${emphasis}`;
}

function readColumnClassName(
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

function readColumnDropState(
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

function canDropTaskOnStatus(task: Task, status: BoardTaskStatus, activeRuns: TaskRun[]): boolean {
  const currentStatus = readBoardStatus(task);

  if (currentStatus === status) return false;
  if (activeRuns.some((run) => run.taskId === task.id) || currentStatus === "queued") return false;
  if (status === "done") return currentStatus === "ready_to_check" || currentStatus === "review";
  return status !== "archived";
}

function readTaskCardIconActionClassName(variant: TaskCardIconActionVariant = "normal"): string {
  const emphasis =
    variant === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:border-emerald-500/60 hover:bg-emerald-500/15 dark:text-emerald-400"
      : variant === "warning"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-600 hover:border-amber-500/60 hover:bg-amber-500/15 dark:text-amber-400"
        : variant === "danger"
          ? "border-red-500/30 bg-red-500/10 text-red-600 hover:border-red-500/60 hover:bg-red-500/15 dark:text-red-400"
          : "border-border bg-surface-elevated text-text-secondary hover:border-accent/50 hover:text-accent";

  return `group relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background ${emphasis}`;
}

function formatResultMessagePreview(message: string): string {
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}

function formatSubtaskPreview(description: string): string {
  return description.length > 100 ? `${description.slice(0, 100)}...` : description;
}

function formatSubtaskDotLabel(description: string): string {
  return `Subtask: ${formatSubtaskPreview(description) || "No description"}`;
}

function readSubtaskDotClassName(
  status: TaskSubtaskProgress["subtasks"][number]["status"],
): string {
  const color =
    status === "done"
      ? "border-emerald-500 bg-emerald-500"
      : status === "review"
        ? "border-red-500 bg-red-500"
        : "border-accent bg-accent";

  return `block h-3 w-3 rounded-full border-2 ring-2 ring-surface ${color}`;
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

function readSubtaskReplyClassName(status: string): string {
  const emphasis =
    status === "review"
      ? "border-amber-400/30 bg-amber-400/10"
      : status === "done" || status === "ready_to_check"
        ? "border-accent/30 bg-accent/10"
        : "border-border bg-surface";

  return `rounded-lg border p-3 ${emphasis}`;
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
  return "Not scheduled";
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
          <p className="mt-2 break-words text-text-secondary [overflow-wrap:anywhere]">
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
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-primary [overflow-wrap:anywhere]">
        {props.value}
      </p>
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
