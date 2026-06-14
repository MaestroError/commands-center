import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Archive,
  Calendar,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Filter,
  Flag,
  Info,
  Link2,
  MessageSquareText,
  Pencil,
  Plus,
  Play,
  RotateCcw,
  Save,
  Trash2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  MAX_FALLBACK_MODELS,
  type Specialist,
  type SpecialistCatalog,
  type BoardTaskStatus,
  type CreateTaskFeedbackInput,
  type CreateTaskInput,
  type CreateTaskTemplateInput,
  type Task,
  type TaskFeedbackThread,
  type TaskQueuePreview,
  type TaskRun,
  type TaskRunArtifact,
  type TaskSubtaskProgress,
  type TaskSubtask,
  type TaskSchedulerState,
  type TaskTemplate,
  type TaskRepeatRule,
  type UpdateTaskInput,
} from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { TabBar } from "@/components/common/TabBar";
import { buildTemplateEndpointDocs } from "@cc/shared/lib";

import { SpecialistAvatar } from "@/components/specialists/specialist-avatar";
import { CopyableCode } from "@/components/api/EndpointsTab";
import { Markdown } from "@/components/chat/Markdown";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { ArtifactShareControls } from "@/components/tasks/ArtifactShareControls";
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
import { useSpecialistCatalogQuery, useSpecialistsQuery } from "@/hooks/use-specialists-query";
import {
  useActiveTaskRunsQuery,
  useArchivedTasksQuery,
  useTaskMutations,
  useTaskFeedbackQuery,
  useTaskQuery,
  useTaskSchedulerStateQuery,
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
  mode?: "list" | "create" | "edit" | "template-edit";
};

type DetailSectionId = "overview" | "subtasks" | "runs";

const TASK_VIEWS = ["board", "templates", "archive"] as const;
const DETAIL_SECTION_TABS = [
  { id: "overview", label: "Overview" },
  { id: "subtasks", label: "Subtasks" },
  { id: "runs", label: "Runs" },
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
    empty: "Queued and running work appears here while the specialist is active.",
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
const FILTER_SUGGESTIONS = [
  "backlog",
  "scheduled",
  "queued",
  "review",
  "ready to check",
  "done",
  "archived",
  "template",
  "manual template",
  "repeating",
  "generated",
] as const;
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
  if (props.mode === "template-edit") return <TaskTemplateFormPage />;
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
  const schedulerStateQuery = useTaskSchedulerStateQuery();
  const templatesQuery = useTaskTemplatesQuery();
  const archiveQuery = useArchivedTasksQuery();
  const agentsQuery = useSpecialistsQuery();
  const mutations = useTaskMutations();
  const [runTemplate, setRunTemplate] = useState<TaskTemplate>();
  const [scheduleDropTask, setScheduleDropTask] = useState<Task>();
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [actionError, setActionError] = useState<string>();
  const agents = agentsQuery.data ?? [];
  const boardTasks = tasksQuery.data ?? [];
  const schedulerStateByTaskId = new Map(
    (schedulerStateQuery.data ?? []).map((state) => [state.taskId, state]),
  );
  const templates = templatesQuery.data ?? [];
  const archivedTasks = archiveQuery.data ?? [];
  const filteredBoardTasks = filterTasks(boardTasks, agents, filterText);
  const filteredTemplates = filterTemplates(templates, agents, filterText);
  const filteredArchivedTasks = filterTasks(archivedTasks, agents, filterText);
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

  async function handleDuplicateTask(task: Task): Promise<void> {
    setActionError(undefined);

    try {
      const duplicated = await mutations.duplicate.mutateAsync(task.id);
      void navigate(`/tasks/${duplicated.id}/edit${currentSearch}`);
    } catch (error) {
      setActionError(readError(error) ?? "Task could not be duplicated.");
    }
  }

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

      <TaskViewNav
        isFilterOpen={isFilterOpen}
        searchParams={searchParams}
        setSearchParams={setSearchParams}
        view={view}
        onToggleFilter={() => {
          setIsFilterOpen((current) => {
            if (current) {
              setFilterText("");
            }

            return !current;
          });
        }}
      />

      {isFilterOpen ? (
        <TaskFilterPanel
          filterText={filterText}
          onChange={setFilterText}
          onClear={() => setFilterText("")}
        />
      ) : null}

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
      {actionError ? <ErrorState description={actionError} title="Task action failed." /> : null}
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
          onDuplicate={(task) => void handleDuplicateTask(task)}
          onSaveAsTemplate={(task) => {
            mutations.createTemplate.mutate(
              {
                defaultAgentId: task.defaultAgentId ?? task.agentId,
                model: task.model,
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
          schedulerStateByTaskId={schedulerStateByTaskId}
          tasks={filteredBoardTasks}
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
          onEdit={(template) =>
            void navigate(`/tasks/templates/${template.id}/edit${currentSearch}`)
          }
          onSelect={(template) => setSelectedTemplate(searchParams, setSearchParams, template.id)}
          onStartCreate={() => setIsCreatingTemplate(true)}
          templates={filteredTemplates}
        />
      ) : null}

      {!isLoading && !error && view === "archive" ? (
        <TaskArchiveView
          agents={agents}
          currentSearch={currentSearch}
          onDelete={(task) => void mutations.remove.mutate(task.id)}
          onRestore={(task) => void mutations.restore.mutate(task.id)}
          tasks={filteredArchivedTasks}
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
      {scheduleDropTask ? (
        <TaskScheduleDropDialog
          busy={mutations.update.isPending}
          task={scheduleDropTask}
          onCancel={() => setScheduleDropTask(undefined)}
          onSubmit={(scheduledAt) => {
            mutations.update.mutate(
              {
                id: scheduleDropTask.id,
                input: { status: "scheduled", scheduledAt },
              },
              { onSuccess: () => setScheduleDropTask(undefined) },
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
          onUpdateContext={(task, context) => {
            mutations.updateContext.mutate({
              id: task.id,
              input: context,
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
          onEdit={(template) =>
            void navigate(`/tasks/templates/${template.id}/edit${currentSearch}`)
          }
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

    if (status === "scheduled") {
      const schedulerState = schedulerStateByTaskId.get(task.id);

      if (!hasUsableScheduledAt(task, schedulerState)) {
        setScheduleDropTask(task);
        return;
      }
    }

    mutations.update.mutate({ id: task.id, input: { status } });
  }
}

function TaskViewNav(props: {
  view: TaskView;
  isFilterOpen: boolean;
  searchParams: URLSearchParams;
  setSearchParams: (params: URLSearchParams) => void;
  onToggleFilter: () => void;
}) {
  return (
    <nav aria-label="Tasks views" className="cc-panel flex flex-wrap items-center gap-2 p-2">
      <div className="flex flex-wrap gap-2">
        {TASK_VIEWS.map((view) => (
          <button
            aria-current={props.view === view ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              props.view === view
                ? "bg-accent text-accent-contrast"
                : "text-text-secondary hover:bg-surface hover:text-text-primary"
            }`}
            data-testid={`task-view-tab-${view}`}
            key={view}
            onClick={() => setTaskView(props.searchParams, props.setSearchParams, view)}
            type="button"
          >
            {formatTaskView(view)}
          </button>
        ))}
      </div>
      <button
        aria-pressed={props.isFilterOpen}
        className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary transition hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        onClick={props.onToggleFilter}
        type="button"
        aria-label="Toggle task filter"
        data-testid="task-filter-toggle"
      >
        <Filter aria-hidden="true" className="h-4 w-4" />
      </button>
    </nav>
  );
}

function TaskFilterPanel(props: {
  filterText: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <section aria-label="Task filter" className="cc-panel grid gap-3 p-4">
      <label className="grid gap-1 text-sm text-text-secondary">
        Filter tasks
        <input
          className="cc-input"
          data-testid="task-filter-input"
          placeholder="Search titles, descriptions, statuses, badges, specialists..."
          value={props.filterText}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {FILTER_SUGGESTIONS.map((suggestion) => (
          <button
            className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary transition hover:border-accent/40 hover:text-accent"
            key={suggestion}
            onClick={() => props.onChange(suggestion)}
            type="button"
          >
            {suggestion}
          </button>
        ))}
        {props.filterText ? (
          <button
            className="cc-button cc-button-secondary h-8 px-3 text-xs"
            onClick={props.onClear}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </div>
    </section>
  );
}

function TaskBoard(props: {
  tasks: Task[];
  agents: Specialist[];
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
  schedulerStateByTaskId: Map<string, TaskSchedulerState>;
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
              data-testid={`task-column-${column.status}`}
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
                  <span
                    className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-text-secondary"
                    data-testid={`task-column-count-${column.status}`}
                  >
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
                    schedulerState={props.schedulerStateByTaskId.get(task.id)}
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
  agent?: Specialist;
  activeRun?: TaskRun;
  progress?: TaskSubtaskProgress;
  schedulerState?: TaskSchedulerState;
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
      data-testid={`task-card-${task.id}`}
      draggable={!props.activeRun}
      onDragEnd={props.onDragEnd}
      onDragStart={props.onDragStart}
    >
      <div className="grid gap-2">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <Link
            className="min-w-0 break-words [overflow-wrap:anywhere] font-semibold leading-6 text-text-primary transition hover:text-accent"
            data-testid={`task-card-title-${task.id}`}
            to={`/tasks${buildPanelSearch(props.currentSearch, task.id)}`}
            onClick={props.onSelect}
          >
            {task.title}
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {(task.latestResultText ?? task.latestFinalMessage) ? (
              <TaskResultMessageTooltip
                message={(task.latestResultText ?? task.latestFinalMessage)!}
              />
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
        <TaskTimingBadges
          hideStaleScheduled
          schedulerState={props.schedulerState}
          task={task}
          surface="background"
        />
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

function TaskTimingBadges(props: {
  task: Task;
  surface: "background" | "surface";
  schedulerState?: TaskSchedulerState;
  hideStaleScheduled?: boolean;
}) {
  const scheduledAt = props.task.scheduledAt ?? props.task.scheduledFor;
  const showScheduledAt =
    scheduledAt &&
    (!props.hideStaleScheduled || !isConsumedScheduledAt(scheduledAt, props.schedulerState));
  const surfaceClassName = props.surface === "background" ? "bg-background" : "bg-surface";

  return (
    <>
      {showScheduledAt ? (
        <span
          aria-label={`Scheduled: ${formatDate(scheduledAt)}`}
          className={`inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-text-secondary ${surfaceClassName}`}
        >
          <Calendar aria-hidden="true" className="h-3.5 w-3.5 text-accent" />
          <span>{`${formatDate(scheduledAt)}`}</span>
        </span>
      ) : null}
      {props.task.dueAt && isDueSoon(props.task.dueAt) ? (
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs text-amber-700 dark:text-amber-300">
          {`Due: ${formatDateOnly(props.task.dueAt)}`}
        </span>
      ) : null}
    </>
  );
}

function TaskScheduleDropDialog(props: {
  task: Task;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (scheduledAt: string) => void;
}) {
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <form
        aria-label="Schedule task"
        className="cc-panel grid w-full max-w-md gap-4 bg-surface-elevated p-5 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();

          if (!scheduledAtLocal) {
            return;
          }

          props.onSubmit(new Date(scheduledAtLocal).toISOString());
        }}
      >
        <div>
          <p className="cc-eyebrow">Schedule Task</p>
          <h2 className="mt-1 text-xl font-semibold text-text-primary">{props.task.title}</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Pick when this task should enter automatic execution.
          </p>
        </div>
        <label className="grid gap-1 text-sm text-text-secondary">
          Schedule for
          <input
            autoFocus
            className="cc-input"
            required
            type="datetime-local"
            value={scheduledAtLocal}
            onChange={(event) => setScheduledAtLocal(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="cc-button cc-button-secondary"
            disabled={props.busy}
            onClick={props.onCancel}
            type="button"
          >
            Cancel
          </button>
          <button className="cc-button" disabled={props.busy || !scheduledAtLocal} type="submit">
            Schedule task
          </button>
        </div>
      </form>
    </div>
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

function BoardAssigneeAvatar(props: { agent?: Specialist; fallbackName: string }) {
  const name = props.agent?.name ?? props.fallbackName;

  return (
    <span
      aria-label={`Assignee: ${name}`}
      className="group relative inline-flex shrink-0"
      tabIndex={0}
      title={name}
    >
      <SpecialistAvatar
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
        testId="task-card-action-queue"
        variant="success"
      />
      <TaskCardIconLink
        icon={props.boardStatus === "scheduled" ? CalendarClock : Pencil}
        label={props.boardStatus === "scheduled" ? "Reschedule" : "Edit"}
        testId="task-card-action-edit"
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
  testId?: string;
  variant?: TaskCardIconActionVariant;
}) {
  const Icon = props.icon;

  return (
    <button
      aria-label={props.label}
      className={readTaskCardIconActionClassName(props.variant)}
      data-testid={props.testId ?? taskCardActionTestId(props.label)}
      onClick={props.onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      <TaskCardIconActionTooltip label={props.label} />
    </button>
  );
}

function taskCardActionTestId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `task-card-action-${slug}`;
}

function CopyEndpointButton(props: { template: TaskTemplate }) {
  const [copied, setCopied] = useState(false);
  const clipboardAvailable = typeof navigator !== "undefined" && Boolean(navigator.clipboard);

  async function copy(): Promise<void> {
    if (!clipboardAvailable) {
      return;
    }

    const docs = buildTemplateEndpointDocs({
      template: {
        id: props.template.id,
        title: props.template.title,
        description: props.template.description,
      },
      baseUrl: typeof window !== "undefined" ? window.location.origin : "",
    });
    await navigator.clipboard.writeText(docs.triggerCurl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <TaskCardIconButton
      icon={copied ? Check : Link2}
      label={
        clipboardAvailable ? (copied ? "Copied" : "Copy endpoint") : "Clipboard is unavailable"
      }
      onClick={() => void copy()}
      testId="task-card-action-copy-endpoint"
    />
  );
}

function TaskCardIconLink(props: {
  icon: LucideIcon;
  label: string;
  to: string;
  onClick?: () => void;
  testId?: string;
  variant?: TaskCardIconActionVariant;
}) {
  const Icon = props.icon;

  return (
    <Link
      aria-label={props.label}
      className={readTaskCardIconActionClassName(props.variant)}
      data-testid={props.testId ?? taskCardActionTestId(props.label)}
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
  agents: Specialist[];
  activeRun?: TaskRun;
  currentSearch: string;
  onAccept: (task: Task) => void;
  onArchive: (task: Task) => void;
  onClose: () => void;
  onQueue: (task: Task) => void;
  onRestore: (task: Task) => void;
  onReopen: (task: Task) => void;
  onUpdateContext: (task: Task, context: Task["context"]) => void;
  onUploadContextAttachment: (task: Task, file: File) => void;
}) {
  const taskQuery = useTaskQuery(props.taskId);
  const runsQuery = useTaskRunsQuery(props.taskId);
  const mutations = useTaskMutations();
  const [selectedSectionId, setSelectedSectionId] = useState<DetailSectionId>();
  const [queuePreview, setQueuePreview] = useState<TaskQueuePreview>();
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [promptDraft, setPromptDraft] = useState<TaskPromptValue>(() => createTaskPromptValue());
  const task = taskQuery.data;
  const agent = props.agents.find((entry) => entry.id === task?.agentId);
  const catalogQuery = useSpecialistCatalogQuery();
  const taskSkills = useTaskComposerSkills(agent, catalogQuery.data);
  const activeSectionId = selectedSectionId ?? "overview";
  const latestRunResult = readLatestRunResult(runsQuery.data ?? []);

  useEffect(() => {
    if (!task || isPromptEditing) {
      return;
    }

    setPromptDraft(createTaskPromptValue(task.description));
  }, [isPromptEditing, task]);

  useEffect(() => {
    if (!task || isTitleEditing) {
      return;
    }

    setTitleDraft(task.title);
  }, [isTitleEditing, task]);

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/40"
        data-testid="task-detail-backdrop"
        onClick={props.onClose}
      />
      <aside
        aria-label="Task detail panel"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl min-w-0 flex-col overflow-hidden border-l border-border bg-surface-elevated shadow-2xl lg:top-0"
        data-testid="task-detail-panel"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border bg-surface-elevated p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="cc-eyebrow">Task Detail</p>
            {task && isTitleEditing ? (
              <form
                className="mt-2 flex min-w-0 items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const title = titleDraft.trim();

                  if (!title) {
                    return;
                  }

                  mutations.update.mutate(
                    { id: task.id, input: { title } },
                    { onSuccess: () => setIsTitleEditing(false) },
                  );
                }}
              >
                <input
                  aria-label="Task title"
                  className="cc-input min-w-0 flex-1 text-3xl font-bold"
                  data-testid="task-title-input"
                  onChange={(event) => setTitleDraft(event.target.value)}
                  value={titleDraft}
                />
                <button
                  aria-label="Save title"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="task-title-save"
                  disabled={mutations.update.isPending || !titleDraft.trim()}
                  type="submit"
                >
                  <Check aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  aria-label="Cancel title edit"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition hover:border-danger/40 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="task-title-cancel"
                  disabled={mutations.update.isPending}
                  onClick={() => {
                    setTitleDraft(task.title);
                    setIsTitleEditing(false);
                  }}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <button
                aria-label="Edit task title"
                className="mt-2 min-w-0 break-words rounded-md border border-transparent p-1 text-left text-3xl font-bold text-text-primary transition hover:border-border hover:bg-surface focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 [overflow-wrap:anywhere]"
                data-testid="task-title-edit"
                disabled={!task}
                onClick={() => {
                  if (!task) {
                    return;
                  }

                  setTitleDraft(task.title);
                  setIsTitleEditing(true);
                }}
                type="button"
              >
                {task?.title ?? "Task detail"}
              </button>
            )}
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
                  {hasTaskModelOverride(task, agent) ? (
                    <span
                      className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary"
                      title="Model override for this task"
                    >
                      {task.model}
                    </span>
                  ) : null}
                  <TaskTimingBadges task={task} surface="surface" />
                  {task.sourceTemplateId ? (
                    <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs text-accent">
                      Generated
                      {task.sourceOccurrenceAt ? ` ${formatDate(task.sourceOccurrenceAt)}` : ""}
                    </span>
                  ) : null}
                </div>
                {isPromptEditing ? (
                  <form
                    className="grid gap-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      mutations.update.mutate(
                        { id: task.id, input: { description: buildTaskPromptText(promptDraft) } },
                        { onSuccess: () => setIsPromptEditing(false) },
                      );
                    }}
                  >
                    <TaskPromptComposer
                      agentId={task.agentId}
                      onChange={setPromptDraft}
                      skills={taskSkills}
                      testId="task-prompt-input"
                      value={promptDraft}
                    />
                    {mutations.update.error ? (
                      <p className="text-sm text-danger">
                        {readError(mutations.update.error) ?? "Task could not be saved."}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="cc-button"
                        data-testid="task-prompt-save"
                        disabled={mutations.update.isPending}
                        type="submit"
                      >
                        {mutations.update.isPending ? "Saving..." : "Save"}
                      </button>
                      <button
                        className="cc-button cc-button-secondary"
                        disabled={mutations.update.isPending}
                        onClick={() => {
                          setPromptDraft(createTaskPromptValue(task.description));
                          setIsPromptEditing(false);
                        }}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    aria-label="Edit task prompt"
                    className="w-full min-w-0 break-words rounded-md border border-transparent p-3 text-left text-sm leading-6 text-text-secondary transition hover:border-border hover:bg-surface hover:text-text-primary focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 [overflow-wrap:anywhere]"
                    data-testid="task-prompt-edit"
                    onClick={() => {
                      setPromptDraft(createTaskPromptValue(task.description));
                      setIsPromptEditing(true);
                    }}
                    type="button"
                  >
                    {task.description || "No description provided."}
                  </button>
                )}
                {latestRunResult ? (
                  <div className={readResultClassName(readBoardStatus(task))}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Latest update:
                    </p>
                    <Markdown
                      className="text-inherit [&_*:first-child]:mt-0 [&_*:last-child]:mb-0 [&_p]:whitespace-pre-wrap [&_p]:text-inherit"
                      content={latestRunResult.content}
                    />
                    {latestRunResult.run.resultText &&
                    latestRunResult.run.resultText !== latestRunResult.content ? (
                      <div className="pt-2">
                        <ClampedResultText
                          className="text-xs italic text-text-secondary"
                          expandable
                          text={latestRunResult.run.resultText}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <TaskPanelArtifactSection runs={runsQuery.data ?? []} />

              <TaskTodosPanelSection task={task} />

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

              <TaskContextPanelSection
                isSaving={mutations.updateContext.isPending}
                onUpdate={(context) => props.onUpdateContext(task, context)}
                onUpload={(file) => props.onUploadContextAttachment(task, file)}
                task={task}
              />

              <article className="cc-panel overflow-visible p-0">
                <TabBar
                  activeTabId={activeSectionId}
                  onTabChange={(tabId) => setSelectedSectionId(tabId as DetailSectionId)}
                  tabs={DETAIL_SECTION_TABS}
                  testIdPrefix="task-detail-tab"
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
                  />
                </div>
              </article>

              <TaskFeedbackPanelSection
                agent={agent}
                agents={props.agents}
                runs={runsQuery.data ?? []}
                task={task}
                taskId={task.id}
              />
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
            <button
              className="cc-button cc-button-secondary"
              disabled={mutations.update.isPending}
              onClick={() => mutations.update.mutate({ id: task.id, input: { status: "backlog" } })}
              type="button"
            >
              Back to Backlog
            </button>
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
    </>
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
  agent?: Specialist;
  agents: Specialist[];
  activeRun?: TaskRun;
  runs: TaskRun[];
  isRunsLoading: boolean;
  runsError: unknown;
}) {
  const subtasksQuery = useTaskSubtasksQuery(props.taskId);
  const isSubtasksSection = props.sectionId === "subtasks";

  if (props.sectionId === "overview") {
    return <TaskOverviewDetails agent={props.agent} task={props.task} />;
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

  return null;
}

function TaskPanelArtifactSection(props: { runs: TaskRun[] }) {
  const artifacts = aggregateRunArtifacts(props.runs);

  if (artifacts.length === 0) {
    return null;
  }

  return (
    <section className="cc-panel grid gap-3 p-4" aria-label="Task artifacts">
      <div>
        <h3 className="font-semibold text-text-primary">Artifacts</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Generated files and links collected across task runs.
        </p>
      </div>
      <div className="grid gap-2">
        {artifacts.map((artifact) => (
          <article className="rounded-lg border border-border bg-surface p-3" key={artifact.key}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <a
                  className="break-words font-medium text-accent underline-offset-4 hover:underline [overflow-wrap:anywhere]"
                  href={artifact.href}
                  rel="noreferrer"
                  target={artifact.external ? "_blank" : undefined}
                >
                  {formatArtifactLinkLabel(artifact.path ?? artifact.title)}
                </a>
                <p className="mt-1 text-xs leading-5 text-text-muted [overflow-wrap:anywhere]">
                  {artifact.path ?? artifact.href}
                </p>
                <p className="mt-3 text-sm leading-6 text-text-secondary">
                  {artifact.description ?? artifact.title}
                </p>
              </div>
              <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-text-secondary">
                {artifact.runCount} run{artifact.runCount === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              Latest: {formatDate(artifact.latestRun.completedAt ?? artifact.latestRun.updatedAt)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function TaskFeedbackPanelSection(props: {
  task: Task;
  taskId: string;
  agent?: Specialist;
  agents: Specialist[];
  runs: TaskRun[];
}) {
  const feedbackQuery = useTaskFeedbackQuery(props.taskId);
  const catalogQuery = useSpecialistCatalogQuery();
  const mutations = useTaskMutations();
  const feedbackSkills = useTaskComposerSkills(props.agent, catalogQuery.data);

  return (
    <section
      className="cc-panel grid gap-4 p-4"
      aria-label="Feedback comments"
      data-testid="task-feedback-section"
    >
      <div>
        <h3 className="font-semibold text-text-primary">Feedback</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Comments, follow-up requests, and specialist replies for this task.
        </p>
      </div>
      <TaskFeedbackSection
        agents={props.agents}
        error={feedbackQuery.error}
        feedback={feedbackQuery.data ?? []}
        isLoading={feedbackQuery.isLoading}
        isSubmitting={mutations.createFeedback.isPending}
        onSubmit={(input, options) =>
          mutations.createFeedback.mutate(
            { id: props.taskId, input },
            { onSuccess: options.onSuccess },
          )
        }
        parentRuns={props.runs}
        skills={feedbackSkills}
        task={props.task}
      />
    </section>
  );
}

function useTaskComposerSkills(
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

function QueuePreviewSummary(props: { preview: TaskQueuePreview }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-text-primary">Next run context preview</p>
          <p className="text-xs text-text-secondary">
            Specialist {props.preview.runAgentId}
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
  agents: Specialist[];
  skills: { slug: string; description?: string }[];
  feedback: TaskFeedbackThread[];
  parentRuns: TaskRun[];
  isLoading: boolean;
  error: unknown;
  isSubmitting: boolean;
  onSubmit: (input: CreateTaskFeedbackInput, options: { onSuccess: () => void }) => void;
}) {
  const [prompt, setPrompt] = useState<TaskPromptValue>(() => createTaskPromptValue());
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const timelineItems = buildFeedbackTimelineItems(props.feedback, props.parentRuns);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = buildTaskPromptText(prompt);

    if (!body) {
      return;
    }

    props.onSubmit(
      {
        body,
        mentionedAgentIds: prompt.mentionedAgents.map((agent) => agent.id),
      },
      {
        onSuccess: () => {
          setPrompt(createTaskPromptValue());
          setIsEditorOpen(false);
        },
      },
    );
  }

  return (
    <div className="grid gap-4">
      {isEditorOpen ? (
        <form
          className="grid gap-3 rounded-lg border border-border bg-surface p-3"
          onSubmit={handleSubmit}
        >
          <section className="grid gap-2 text-sm text-text-secondary">
            <div>
              <p className="text-xs text-text-secondary">
                Use # for files, / for skills, and @ to mention specialists for subtasks.
              </p>
            </div>
            <TaskPromptComposer
              agentId={props.task.agentId}
              agents={props.agents}
              autoFocus
              fileSearchAgentId={prompt.mentionedAgents[0]?.id ?? null}
              label="Feedback"
              onChange={setPrompt}
              placeholder="Describe the follow-up work or correction needed."
              skills={props.skills}
              testId="task-feedback-input"
              value={prompt}
            />
          </section>
          <p className="text-xs text-text-secondary italic">
            If no specialist is mentioned, feedback creates one subtask for the task default
            specialist.
          </p>
          <button
            className="cc-button w-fit"
            data-testid="task-feedback-submit"
            disabled={props.isSubmitting}
            type="submit"
          >
            {props.isSubmitting ? "Adding..." : "Add feedback"}
          </button>
        </form>
      ) : (
        <button
          className="flex min-h-11 w-full items-center rounded-lg border border-border bg-surface px-3 text-left text-sm text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          data-testid="task-feedback-open"
          onClick={() => setIsEditorOpen(true)}
          type="button"
        >
          Leave comment
        </button>
      )}

      {props.isLoading ? <LoadingState testId="task-feedback-loading" /> : null}
      {props.error ? (
        <ErrorState
          description={readError(props.error) ?? "Request failed."}
          title="Feedback could not be loaded."
        />
      ) : null}
      {!props.isLoading &&
      props.feedback.length === 0 &&
      !hasParentRunComments(props.parentRuns) ? (
        <EmptyState
          description="Feedback added here creates specialist-assigned subtasks, and completed task runs appear as specialist comments."
          title="No feedback yet"
        />
      ) : null}
      {timelineItems.length > 0 ? (
        <div className="grid gap-4">
          {timelineItems.map((item) => {
            if (item.type === "feedback") {
              const entry = item.feedback;
              return (
                <article
                  className="grid gap-3"
                  data-testid={`task-feedback-comment-${entry.id}`}
                  key={entry.id}
                >
                  <FeedbackComment
                    author="Me"
                    body={entry.body}
                    meta={
                      <>
                        <span>{formatDate(entry.createdAt)}</span>
                        {entry.targetAgentIds.map((agentId) => (
                          <span
                            className="rounded-full border border-border px-2 py-0.5"
                            key={agentId}
                          >
                            @{readAgentName(props.agents, agentId)}
                          </span>
                        ))}
                      </>
                    }
                    tone="operator"
                  />
                  <FeedbackReplies agents={props.agents} subtasks={entry.subtasks} />
                </article>
              );
            }

            const run = item.run;
            return (
              <FeedbackComment
                author={`${readAgentName(props.agents, run.agentId)} commented`}
                body={readRunCommentBody(run)}
                resultText={run.resultText}
                key={run.id}
                meta={
                  <>
                    <StatusBadge status={run.status} />
                    <span>{formatDate(run.completedAt ?? run.updatedAt)}</span>
                    <Link
                      className="font-medium text-accent underline-offset-4 hover:underline"
                      to={`/tasks/${props.task.id}/runs/${run.id}`}
                    >
                      Open run
                    </Link>
                  </>
                }
                artifacts={run.artifacts}
                taskId={props.task.id}
                runId={run.id}
                tone="agent"
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FeedbackComment(props: {
  author: string;
  body: string;
  resultText?: string;
  artifacts?: TaskRunArtifact[];
  taskId?: string;
  runId?: string;
  meta: ReactNode;
  tone: "operator" | "agent";
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-surface-elevated p-3 shadow-sm">
      <div
        aria-hidden="true"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          props.tone === "agent" ? "bg-accent/15 text-accent" : "bg-surface-muted text-text-primary"
        }`}
      >
        {props.author.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span className="font-medium text-text-primary">{props.author}</span>
          {props.meta}
        </div>
        <Markdown
          className="mt-1 text-sm leading-6 text-text-secondary [&_*:first-child]:mt-0 [&_*:last-child]:mb-0 [&_p]:whitespace-pre-wrap [&_p]:text-inherit"
          content={props.body}
        />
        {props.resultText && props.resultText !== props.body ? (
          <div className={`mt-2 ${RESULT_BOX_CLASS}`}>
            <ClampedResultText
              className="text-xs italic leading-5 text-text-primary"
              expandable
              text={props.resultText}
            />
          </div>
        ) : null}
        <RunArtifactAttachments
          artifacts={props.artifacts ?? []}
          taskId={props.taskId}
          runId={props.runId}
        />
      </div>
    </div>
  );
}

function RunArtifactAttachments(props: {
  artifacts: TaskRunArtifact[];
  taskId?: string;
  runId?: string;
}) {
  if (props.artifacts.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 grid gap-2" aria-label="Run artifacts">
      {props.artifacts.map((artifact) => {
        const href = artifact.path
          ? buildFileManagerHref({ path: artifact.path, openInEditor: true })
          : (artifact.url ?? "#");
        return (
          <li
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary"
            key={`${artifact.path ?? artifact.url ?? artifact.title}:${artifact.title}`}
          >
            <span className="min-w-0">
              <a
                className="break-words font-medium text-accent underline-offset-4 hover:underline [overflow-wrap:anywhere]"
                href={href}
                rel="noreferrer"
                target={artifact.path ? undefined : "_blank"}
              >
                {formatArtifactLinkLabel(artifact.path ?? artifact.title)}
              </a>
              <span className="block text-xs text-text-muted [overflow-wrap:anywhere]">
                {artifact.path ?? artifact.url ?? artifact.title}
              </span>
              <span className="mt-2 block text-xs text-text-secondary">
                {artifact.description ?? artifact.title}
              </span>
              {props.taskId && props.runId ? (
                <ArtifactShareControls
                  artifact={artifact}
                  taskId={props.taskId}
                  runId={props.runId}
                />
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TaskSubtasksSection(props: {
  agents: Specialist[];
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
          description="Feedback creates simple subtasks assigned to the mentioned specialists."
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

function FeedbackReplies(props: {
  agents: Specialist[];
  subtasks: TaskFeedbackThread["subtasks"];
}) {
  const replies = props.subtasks.flatMap((subtask) =>
    subtask.replies.map((reply) => ({ ...reply, agentId: subtask.agentId })),
  );

  if (replies.length === 0) {
    return null;
  }

  return (
    <div className="ml-6 grid gap-3 border-l border-border pl-4">
      {replies.map((reply) => (
        <FeedbackComment
          author={`${readAgentName(props.agents, reply.agentId)} replied`}
          body={readRunCommentBody(reply.run)}
          resultText={reply.run.resultText}
          key={reply.run.id}
          meta={
            <>
              <StatusBadge status={reply.status} />
              <span>{formatDate(reply.run.completedAt ?? reply.run.updatedAt)}</span>
            </>
          }
          artifacts={reply.run.artifacts}
          taskId={reply.run.taskId}
          runId={reply.run.id}
          tone="agent"
        />
      ))}
    </div>
  );
}

function TaskOverviewDetails(props: { task: Task; agent?: Specialist }) {
  const rows = [
    { label: "Status", value: formatToken(readBoardStatus(props.task)) },
    { label: "Specialist", value: props.agent?.name ?? props.task.agentId },
    { label: "Model", value: formatTaskModel(props.task, props.agent) },
    { label: "Schedule", value: formatSchedule(props.task) },
    { label: "Source", value: formatSourceTemplate(props.task) },
    { label: "Todos", value: formatTodoProgress(props.task) },
    { label: "Latest run", value: props.task.latestRunId ?? "No runs yet" },
    { label: "Enabled", value: props.task.enabled ? "Yes" : "No" },
    { label: "Created", value: formatDate(props.task.createdAt) },
    { label: "Updated", value: formatDate(props.task.updatedAt) },
  ];

  return (
    <section aria-label="Overview details" className="min-w-0">
      <dl className="grid min-w-0 grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-4 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
        {rows.map((row) => (
          <div className="contents" key={row.label}>
            <dt className="font-medium text-text-secondary">{row.label}</dt>
            <dd className="min-w-0 break-words text-text-primary [overflow-wrap:anywhere]">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
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

function TaskContextPanelSection(props: {
  task: Task;
  isSaving: boolean;
  onUpdate: (context: Task["context"]) => void;
  onUpload: (file: File) => void;
}) {
  const [isOpen, setIsOpen] = usePersistentTaskContextOpen(props.task.id);
  const [isEditingText, setIsEditingText] = useState(false);
  const [text, setText] = useState(props.task.context.text ?? "");

  useEffect(() => {
    if (isEditingText) {
      return;
    }

    setText(props.task.context.text ?? "");
  }, [isEditingText, props.task.context.text]);

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file) {
      props.onUpload(file);
    }
  }

  function handleSaveText() {
    props.onUpdate({ ...props.task.context, text });
    setIsEditingText(false);
  }

  function handleCancelText() {
    setText(props.task.context.text ?? "");
    setIsEditingText(false);
  }

  function handleRemoveAttachment(attachmentId: string) {
    props.onUpdate({
      ...props.task.context,
      attachments: props.task.context.attachments.filter(
        (attachment) => attachment.id !== attachmentId,
      ),
    });
  }

  const contextSummary = formatTaskContextSummary(props.task);

  return (
    <section className="cc-panel overflow-hidden p-0">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-surface"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="min-w-0">
          <span className="block font-semibold text-text-primary">Context</span>
          <span className="mt-1 block truncate text-sm text-text-secondary">{contextSummary}</span>
        </span>
        {isOpen ? (
          <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-text-secondary" />
        ) : (
          <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-text-secondary" />
        )}
      </button>

      {isOpen ? (
        <div className="grid gap-4 border-t border-border p-4">
          {isEditingText ? (
            <div className="grid gap-3">
              <label className="grid gap-2 text-sm text-text-secondary">
                Task context
                <textarea
                  className="cc-input min-h-32 resize-y"
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Optional persistent context for future task runs..."
                  value={text}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  className="cc-button"
                  disabled={props.isSaving}
                  onClick={handleSaveText}
                  type="button"
                >
                  {props.isSaving ? "Saving..." : "Save context"}
                </button>
                <button
                  className="cc-button cc-button-secondary"
                  disabled={props.isSaving}
                  onClick={handleCancelText}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              aria-label="Edit task context"
              className="w-full min-w-0 break-words rounded-md border border-border bg-surface p-3 text-left text-sm leading-6 text-text-secondary transition hover:border-accent/40 hover:text-text-primary focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 [overflow-wrap:anywhere]"
              onClick={() => {
                setText(props.task.context.text ?? "");
                setIsEditingText(true);
              }}
              type="button"
            >
              {props.task.context.text || "No context text yet."}
            </button>
          )}

          <div className="flex flex-wrap gap-2">
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
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary"
                    key={attachment.id}
                  >
                    <span className="min-w-0">
                      <a
                        className="break-words font-medium text-accent underline-offset-4 hover:underline [overflow-wrap:anywhere]"
                        href={buildTaskContextAttachmentHref(attachment.storageKey)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {attachment.filename}
                      </a>
                      <span className="block text-xs text-text-secondary">
                        {attachment.mimeType} · {formatBytes(attachment.sizeBytes)}
                      </span>
                    </span>
                    <button
                      aria-label={`Remove ${attachment.filename}`}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary transition hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={props.isSaving}
                      onClick={() => handleRemoveAttachment(attachment.id)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-text-secondary">No context attachments yet.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function TaskTodos(props: { task: Task }) {
  if (props.task.todos.length === 0) {
    return <p className="text-sm text-text-secondary">No todo items.</p>;
  }

  return (
    <div>
      <h3 className="font-semibold text-text-primary">Todos</h3>
      <TaskTodoItems className="mt-3" task={props.task} />
    </div>
  );
}

function TaskTodosPanelSection(props: { task: Task }) {
  const [isOpen, setIsOpen] = usePersistentTaskSectionOpen(props.task.id, "todos", true);
  const [isEditing, setIsEditing] = useState(false);
  const [todosText, setTodosText] = useState(() => formatTodoItemsText(props.task));
  const mutations = useTaskMutations();

  useEffect(() => {
    if (isEditing) {
      return;
    }

    setTodosText(formatTodoItemsText(props.task));
  }, [isEditing, props.task]);

  if (props.task.todos.length === 0) {
    return null;
  }

  return (
    <section className="cc-panel overflow-hidden p-0">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-surface"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="min-w-0">
          <span className="block font-semibold text-text-primary">Todos</span>
          <span className="mt-1 block text-sm text-text-secondary">
            {formatTodoProgress(props.task)}
          </span>
        </span>
        {isOpen ? (
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-text-secondary" />
        ) : (
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-secondary" />
        )}
      </button>
      {isOpen ? (
        <div className="border-t border-border p-4">
          {isEditing ? (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                mutations.update.mutate(
                  {
                    id: props.task.id,
                    input: { todos: buildTaskTodoInputs(todosText, props.task) },
                  },
                  { onSuccess: () => setIsEditing(false) },
                );
              }}
            >
              <label className="grid gap-1 text-sm text-text-secondary">
                Todo items, one per line
                <textarea
                  aria-label="Todo items"
                  className="cc-input min-h-28 resize-y"
                  value={todosText}
                  onChange={(event) => setTodosText(event.target.value)}
                />
              </label>
              {mutations.update.error ? (
                <p className="text-sm text-danger">
                  {readError(mutations.update.error) ?? "Task could not be saved."}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button className="cc-button" disabled={mutations.update.isPending} type="submit">
                  {mutations.update.isPending ? "Saving..." : "Save"}
                </button>
                <button
                  className="cc-button cc-button-secondary"
                  disabled={mutations.update.isPending}
                  onClick={() => {
                    setTodosText(formatTodoItemsText(props.task));
                    setIsEditing(false);
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              aria-label="Edit todos"
              className="w-full rounded-md border border-transparent p-0 text-left transition hover:border-border hover:bg-surface focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              onClick={() => setIsEditing(true)}
              type="button"
            >
              {props.task.todos.length === 0 ? (
                <span className="block p-3 text-sm text-text-secondary">No todo items.</span>
              ) : (
                <span className="grid gap-2">
                  {props.task.todos.map((todo) => (
                    <span
                      className="rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary"
                      key={todo.id}
                    >
                      {todo.status === "completed" ? "[x]" : "[ ]"} {todo.content}
                    </span>
                  ))}
                </span>
              )}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function formatTodoItemsText(task: Task): string {
  return task.todos.map((todo) => todo.content).join("\n");
}

function buildTaskTodoInputs(text: string, task: Task): NonNullable<UpdateTaskInput["todos"]> {
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

function TaskTodoItems(props: { task: Task; className?: string }) {
  return (
    <ul className={`grid gap-2 ${props.className ?? ""}`}>
      {props.task.todos.map((todo) => (
        <li
          className="rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary"
          key={todo.id}
        >
          {todo.status === "completed" ? "[x]" : "[ ]"} {todo.content}
        </li>
      ))}
    </ul>
  );
}

function usePersistentTaskContextOpen(
  taskId: string,
): readonly [boolean, (value: boolean | ((current: boolean) => boolean)) => void] {
  return usePersistentTaskSectionOpen(taskId, "context", false);
}

function usePersistentTaskSectionOpen(
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

function formatTaskContextSummary(task: Task): string {
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

function TaskTemplatesView(props: {
  templates: TaskTemplate[];
  agents: Specialist[];
  currentSearch: string;
  isCreating: boolean;
  isCreatingBusy: boolean;
  onCancelCreate: () => void;
  onCreate: (input: CreateTaskTemplateInput) => void;
  onCreateTask: (template: TaskTemplate) => void;
  onEdit: (template: TaskTemplate) => void;
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
            <article
              className="cc-panel grid gap-4 p-5"
              data-testid={`task-template-card-${template.id}`}
              key={template.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <button
                    className="text-left text-xl font-semibold text-text-primary transition hover:text-accent"
                    data-testid={`task-template-title-${template.id}`}
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
                <Metric label="Default specialist" value={agent?.name ?? template.defaultAgentId} />
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
                  data-testid="task-template-create-task"
                  onClick={() => props.onCreateTask(template)}
                  type="button"
                >
                  Create task
                </button>
                {template.latestTaskId ? (
                  <Link
                    className="cc-button cc-button-secondary"
                    to={`/tasks/${template.latestTaskId}${props.currentSearch}`}
                  >
                    Open latest task
                  </Link>
                ) : null}
                <TaskCardIconButton
                  icon={Play}
                  label="Run now"
                  onClick={() => props.onRunNow(template)}
                  variant="success"
                />
                <TaskCardIconButton
                  icon={Pencil}
                  label="Edit template"
                  onClick={() => props.onEdit(template)}
                />
                <TaskCardIconButton
                  icon={Info}
                  label="View details"
                  onClick={() => props.onSelect(template)}
                />
                <CopyEndpointButton template={template} />
                <TaskCardIconButton
                  icon={Trash2}
                  label="Delete template"
                  onClick={() => props.onDelete(template)}
                  variant="danger"
                />
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function TaskTemplateCreateForm(props: {
  agents: Specialist[];
  isBusy: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateTaskTemplateInput) => void;
}) {
  return (
    <TaskTemplateForm
      agents={props.agents}
      cancelLabel="Cancel"
      isBusy={props.isBusy}
      submitLabel="Create template"
      title="Create task template"
      onCancel={props.onCancel}
      onSubmit={props.onSubmit}
    />
  );
}

function TaskTemplateForm(props: {
  agents: Specialist[];
  cancelLabel: string;
  initialTemplate?: TaskTemplate;
  isBusy: boolean;
  submitLabel: string;
  title: string;
  onCancel: () => void;
  onSubmit: (input: CreateTaskTemplateInput) => void;
}) {
  const [form, setForm] = useState<FormState>(() => templateToForm(props.initialTemplate));

  useEffect(() => {
    if (props.initialTemplate) {
      setForm(templateToForm(props.initialTemplate));
    }
  }, [props.initialTemplate]);

  return (
    <form
      className="cc-panel grid gap-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit(formToTemplateInput(form));
      }}
    >
      <div>
        <h2 className="text-xl font-semibold text-text-primary">{props.title}</h2>
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
            data-testid="task-template-title-input"
            required
            value={form.title}
            onChange={(event) => updateForm({ title: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm text-text-secondary">
          Default specialist
          <select
            className="cc-input"
            required
            value={form.agentId}
            onChange={(event) => updateForm({ agentId: event.target.value })}
          >
            <option value="">Select a specialist</option>
            {props.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-text-secondary">
          Model
          <ModelSelector
            allowSpecialistDefault
            defaultModel={props.agents.find((agent) => agent.id === form.agentId)?.defaultModel}
            onChange={(model) => updateForm({ model })}
            placement="down"
            value={form.model || null}
          />
        </label>
        <FallbackModelsField
          fallbackModels={form.fallbackModels}
          primaryModel={form.model}
          onChange={(fallbackModels) => updateForm({ fallbackModels })}
        />
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
        <button
          className="cc-button"
          data-testid="task-template-save"
          disabled={props.isBusy}
          type="submit"
        >
          {props.submitLabel}
        </button>
        <button className="cc-button cc-button-secondary" onClick={props.onCancel} type="button">
          {props.cancelLabel}
        </button>
      </div>
    </form>
  );

  function updateForm(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }
}

function TaskTemplateFormPage() {
  const navigate = useNavigate();
  const params = useParams();
  const templateQuery = useTaskTemplateQuery(params["id"]);
  const agentsQuery = useSpecialistsQuery();
  const mutations = useTaskMutations();
  const template = templateQuery.data;
  const agents = agentsQuery.data ?? [];
  const isLoading = templateQuery.isLoading || agentsQuery.isLoading;
  const error = readError(
    templateQuery.error ?? agentsQuery.error ?? mutations.updateTemplate.error,
  );

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          <Link className="cc-button cc-button-secondary" to="/tasks?view=templates">
            Cancel
          </Link>
        }
        description="Update the template setup used for future generated tasks. Existing generated tasks keep their copied content."
        eyebrow="Task Templates"
        title="Edit task template"
      />

      {isLoading ? <LoadingState testId="task-template-form-loading" /> : null}
      {error ? <ErrorState description={error} title="Template could not be saved." /> : null}
      {!isLoading && template ? (
        <TaskTemplateForm
          agents={agents}
          cancelLabel="Cancel"
          initialTemplate={template}
          isBusy={mutations.updateTemplate.isPending}
          submitLabel="Save template"
          title="Edit task template"
          onCancel={() => void navigate(`/tasks?view=templates&template=${template.id}`)}
          onSubmit={(input) => {
            mutations.updateTemplate.mutate(
              { id: template.id, input },
              {
                onSuccess: (updated) =>
                  void navigate(`/tasks?view=templates&template=${updated.id}`),
              },
            );
          }}
        />
      ) : null}
    </div>
  );
}

function TaskTemplateDetailPanel(props: {
  templateId: string;
  agents: Specialist[];
  currentSearch: string;
  onClose: () => void;
  onCreateTask: (template: TaskTemplate) => void;
  onEdit: (template: TaskTemplate) => void;
  onOpenTask: (taskId: string) => void;
  onRunNow: (template: TaskTemplate) => void;
  onDelete: (template: TaskTemplate) => void;
}) {
  const templateQuery = useTaskTemplateQuery(props.templateId);
  const tasksQuery = useTaskTemplateTasksQuery(props.templateId);
  const [detailTab, setDetailTab] = useState("details");
  const template = templateQuery.data;
  const agent = template
    ? props.agents.find((entry) => entry.id === template.defaultAgentId)
    : undefined;
  const error = readError(templateQuery.error ?? tasksQuery.error);

  return (
    <aside
      aria-label="Task template detail panel"
      className="fixed inset-y-0 right-0 z-40 grid w-full grid-rows-[auto_1fr] border-l border-border bg-surface-elevated shadow-2xl sm:max-w-2xl"
      data-testid="task-template-detail-panel"
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
            <TabBar
              activeTabId={detailTab}
              onTabChange={setDetailTab}
              tabs={[
                { id: "details", label: "Details" },
                { id: "docs", label: "Docs" },
              ]}
            />
            {detailTab === "docs" ? <TemplateDocsTab template={template} /> : null}
            <div className={detailTab === "details" ? "grid gap-4" : "hidden"}>
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
                <Metric label="Default specialist" value={agent?.name ?? template.defaultAgentId} />
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
                  data-testid="task-template-detail-create-task"
                  onClick={() => props.onCreateTask(template)}
                  type="button"
                >
                  Create task
                </button>
                <TaskCardIconButton
                  icon={Pencil}
                  label="Edit template"
                  onClick={() => props.onEdit(template)}
                />
                <TaskCardIconButton
                  icon={Play}
                  label="Run now"
                  onClick={() => props.onRunNow(template)}
                  variant="success"
                />
                {template.latestTaskId ? (
                  <button
                    className="cc-button cc-button-secondary"
                    onClick={() => props.onOpenTask(template.latestTaskId ?? "")}
                    type="button"
                  >
                    Open latest task
                  </button>
                ) : null}
                <TaskCardIconButton
                  icon={Trash2}
                  label="Delete template"
                  onClick={() => props.onDelete(template)}
                  variant="danger"
                />
              </div>
              <GeneratedTaskHistory
                currentSearch={props.currentSearch}
                error={tasksQuery.error}
                isLoading={tasksQuery.isLoading}
                onOpenTask={props.onOpenTask}
                tasks={tasksQuery.data ?? []}
              />
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function TemplateDocsTab(props: { template: TaskTemplate }) {
  const [copiedInstructions, setCopiedInstructions] = useState(false);
  const clipboardAvailable = typeof navigator !== "undefined" && Boolean(navigator.clipboard);
  const docs = buildTemplateEndpointDocs({
    template: {
      id: props.template.id,
      title: props.template.title,
      description: props.template.description,
    },
    baseUrl: typeof window !== "undefined" ? window.location.origin : "",
  });

  async function copyInstructions(): Promise<void> {
    if (!clipboardAvailable) {
      return;
    }

    await navigator.clipboard.writeText(docs.agentInstructions);
    setCopiedInstructions(true);
    window.setTimeout(() => setCopiedInstructions(false), 1500);
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-text-primary">Integration instructions</h3>
            <p className="mt-1 text-sm text-text-secondary">
              Self-contained guide you can hand straight to an AI agent. Tokens are never embedded —
              replace the placeholder with one from the API page.
            </p>
          </div>
          <button
            className="cc-button inline-flex items-center gap-2"
            disabled={!clipboardAvailable}
            onClick={() => void copyInstructions()}
            title={clipboardAvailable ? "Copy instructions" : "Clipboard is unavailable"}
            type="button"
          >
            {copiedInstructions ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiedInstructions ? "Copied" : "Copy integration instructions"}
          </button>
        </div>
        <div className="rounded-lg border border-border bg-app-bg p-4 text-sm">
          <Markdown content={docs.agentInstructions} />
        </div>
      </div>
      <CopyableCode code={docs.triggerCurl} label="Trigger now (curl)" />
      <CopyableCode code={docs.scheduleCurl} label="Schedule (curl)" />
      <CopyableCode code={docs.pollCurl} label="Poll run status (curl)" />
    </div>
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
  agents: Specialist[];
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
              label="Specialist"
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
  const agentsQuery = useSpecialistsQuery();
  const catalogQuery = useSpecialistCatalogQuery();
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
        description="Define the schedule, assigned specialist, and lightweight task todo list. Run-specific context is added when triggering the task."
        eyebrow="Tasks"
        title={props.mode === "create" ? "Create task" : "Edit task"}
      />

      {isLoading ? <LoadingState testId="task-form-loading" /> : null}
      {error ? <ErrorState description={error} title="Task could not be saved." /> : null}

      {!isLoading ? (
        <WorkspaceLayout
          contextPane={{
            title: selectedAgent ? `${selectedAgent.name} workspace` : "Specialist workspace",
            tabs: [
              {
                id: "files",
                label: "Files",
                content: selectedAgent ? (
                  <div className="flex h-full flex-col">
                    <WorkspaceFilesTab agentId={selectedAgent.id} agentSlug={selectedAgent.slug} />
                  </div>
                ) : (
                  <p className="p-3 text-sm text-text-secondary">
                    Select a specialist to browse workspace files and drag files into the task
                    prompt.
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
                    value={form.title}
                    onChange={(event) => updateForm({ title: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm text-text-secondary">
                  Assigned specialist
                  <select
                    className="cc-input"
                    required
                    value={form.agentId}
                    onChange={(event) => handleAgentChange(event.target.value)}
                  >
                    <option value="">Select a specialist</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm text-text-secondary">
                  Model
                  <ModelSelector
                    allowSpecialistDefault
                    defaultModel={agents.find((agent) => agent.id === form.agentId)?.defaultModel}
                    onChange={(model) => updateForm({ model })}
                    placement="down"
                    value={form.model || null}
                  />
                </label>
                <FallbackModelsField
                  fallbackModels={form.fallbackModels}
                  primaryModel={form.model}
                  onChange={(fallbackModels) => updateForm({ fallbackModels })}
                />
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
                  This UI currently inherits the assigned specialist permissions. Task runs still
                  persist their effective permission snapshot and auto-approve task-safe rules.
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
      await mutations.create.mutateAsync(input as CreateTaskInput);
      void navigate("/tasks");
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
  todosText: string;
};

type RepeatPreset = (typeof REPEAT_PRESETS)[number];
type RepeatFrequency = (typeof REPEAT_FREQUENCIES)[number];
type TaskView = (typeof TASK_VIEWS)[number];

function taskToForm(task?: Task, prefill?: TaskCreationPrefill): FormState {
  return {
    agentId: task?.agentId ?? prefill?.agentId ?? "",
    model: task?.model ?? "",
    fallbackModels: task?.fallbackModels ?? [],
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

function templateToForm(template?: TaskTemplate): FormState {
  const repeatRule = template?.recurrence?.repeatRule;
  const repeatFrequency = repeatRule?.frequency ?? "week";

  return {
    agentId: template?.defaultAgentId ?? "",
    model: template?.model ?? "",
    fallbackModels: template?.fallbackModels ?? [],
    title: template?.title ?? "",
    prompt: createTaskPromptValue(template?.description ?? ""),
    scheduledAtLocal: "",
    dueAtLocal: "",
    anchorAtLocal: template?.recurrence?.anchorAt
      ? toLocalDateTime(template.recurrence.anchorAt)
      : toLocalDateTime(new Date().toISOString()),
    timezone: template?.recurrence?.timezone ?? readLocalTimezone(),
    repeatPreset: readRepeatPreset(repeatRule),
    repeatFrequency,
    repeatInterval: String(repeatRule?.interval ?? 1),
    repeatWeekdays: repeatRule?.weekdays ?? (repeatFrequency === "week" ? [1] : []),
    repeatEnabled: Boolean(template?.recurrence),
    todosText: template?.todos.map((todo) => todo.content).join("\n") ?? "",
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

function getTaskCreationPrefill(state: unknown): TaskCreationPrefill | undefined {
  if (!state || typeof state !== "object" || !("taskPrefill" in state)) {
    return undefined;
  }

  const taskPrefill = (state as { taskPrefill: unknown }).taskPrefill;
  return isTaskCreationPrefill(taskPrefill) ? taskPrefill : undefined;
}

function formToTaskInput(form: FormState): CreateTaskInput | UpdateTaskInput {
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

function formToTemplateInput(form: FormState): CreateTaskTemplateInput {
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

function FallbackModelsField(props: {
  fallbackModels: string[];
  primaryModel: string;
  onChange: (fallbackModels: string[]) => void;
}) {
  const displayedModels = props.fallbackModels.slice(0, MAX_FALLBACK_MODELS);
  const canAdd = displayedModels.length < MAX_FALLBACK_MODELS;

  return (
    <section className="grid gap-2 text-sm text-text-secondary">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span>Fallback models</span>
        <button
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition hover:border-accent/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canAdd}
          title="Add fallback model"
          type="button"
          onClick={() => props.onChange([...displayedModels, ""])}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {displayedModels.length === 0 ? (
        <p className="text-xs text-text-secondary">No fallback models configured.</p>
      ) : (
        <div className="grid gap-2">
          {displayedModels.map((model, index) => (
            <div className="flex min-w-0 items-center gap-2" key={`${model || "empty"}-${index}`}>
              <ModelSelector
                allowEmptySelection
                onChange={(nextModel) => {
                  const next = [...displayedModels];
                  next[index] = nextModel;
                  props.onChange(normalizeTaskFallbackModels(next, props.primaryModel));
                }}
                placeholder="Select fallback"
                placement="down"
                value={model || null}
              />
              <button
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary transition hover:bg-danger/10 hover:text-danger"
                title="Remove fallback model"
                type="button"
                onClick={() =>
                  props.onChange(
                    displayedModels.filter((_, fallbackIndex) => fallbackIndex !== index),
                  )
                }
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function templateAsTask(template: TaskTemplate): Task {
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

function normalizeTaskFallbackModels(models: string[], primaryModel: string): string[] {
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

function filterTasks(tasks: Task[], agents: Specialist[], filterText: string): Task[] {
  const query = normalizeFilterText(filterText);

  if (!query) {
    return tasks;
  }

  return tasks.filter((task) => buildTaskFilterText(task, agents).includes(query));
}

function filterTemplates(
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

function readAgentName(agents: Specialist[], agentId: string): string {
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

function hasUsableScheduledAt(task: Task, schedulerState?: TaskSchedulerState): boolean {
  const scheduledAt = task.scheduledAt ?? task.scheduledFor;

  return Boolean(scheduledAt && !isConsumedScheduledAt(scheduledAt, schedulerState));
}

function isConsumedScheduledAt(scheduledAt: string, schedulerState?: TaskSchedulerState): boolean {
  return Boolean(
    schedulerState?.lastScheduledAt &&
    new Date(scheduledAt).getTime() <= new Date(schedulerState.lastScheduledAt).getTime(),
  );
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

// Blueish, rounded result box matching the "Latest update" treatment.
const RESULT_BOX_CLASS =
  "min-w-0 break-words [overflow-wrap:anywhere] rounded-lg border border-accent/30 bg-accent/10 p-3 text-text-primary";

/** Renders text clamped to ~3 lines (with an ellipsis); optionally click-to-expand. */
function ClampedResultText(props: { text: string; expandable?: boolean; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const textClass = `block break-words [overflow-wrap:anywhere] ${
    expanded ? "whitespace-pre-wrap" : "line-clamp-3"
  } ${props.className ?? ""}`;

  if (!props.expandable) {
    return (
      <span
        className={`block break-words [overflow-wrap:anywhere] line-clamp-3 ${props.className ?? ""}`}
      >
        {props.text}
      </span>
    );
  }

  return (
    <button
      aria-expanded={expanded}
      className="block w-full cursor-pointer text-left"
      onClick={() => setExpanded((value) => !value)}
      title={expanded ? "Click to collapse" : "Click to expand"}
      type="button"
    >
      <span className={textClass}>{props.text}</span>
    </button>
  );
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

function readLatestRunResult(runs: TaskRun[]): { content: string; run: TaskRun } | undefined {
  const [latestRun] = runs;
  const content = latestRun
    ? (latestRun.finalMessage ?? latestRun.resultText ?? latestRun.errorMessage)
    : undefined;

  return latestRun && content ? { content, run: latestRun } : undefined;
}

function hasRunOutcomeSummary(run: TaskRun): boolean {
  return Boolean(!run.subtaskId && (run.finalMessage || run.resultText || run.errorMessage));
}

function hasParentRunComments(runs: TaskRun[]): boolean {
  return runs.some(hasRunOutcomeSummary);
}

type FeedbackTimelineItem =
  | { type: "feedback"; id: string; timestamp: string; feedback: TaskFeedbackThread }
  | { type: "run"; id: string; timestamp: string; run: TaskRun };

function buildFeedbackTimelineItems(
  feedback: TaskFeedbackThread[],
  runs: TaskRun[],
): FeedbackTimelineItem[] {
  return [
    ...feedback.map((entry) => ({
      type: "feedback" as const,
      id: entry.id,
      timestamp: entry.createdAt,
      feedback: entry,
    })),
    ...runs.filter(hasRunOutcomeSummary).map((run) => ({
      type: "run" as const,
      id: run.id,
      timestamp: run.completedAt ?? run.updatedAt,
      run,
    })),
  ].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
}

function readRunCommentBody(run: TaskRun): string {
  return run.finalMessage ?? run.resultText ?? run.errorMessage ?? "No result yet.";
}

function formatArtifactLinkLabel(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() ?? value;
}

type AggregatedRunArtifact = {
  key: string;
  title: string;
  description?: string;
  path?: string;
  href: string;
  external: boolean;
  latestRun: TaskRun;
  runCount: number;
};

function aggregateRunArtifacts(runs: TaskRun[]): AggregatedRunArtifact[] {
  const byKey = new Map<
    string,
    { artifact: TaskRunArtifact; latestRun: TaskRun; runIds: Set<string> }
  >();

  for (const run of runs) {
    for (const artifact of run.artifacts) {
      const key = artifact.path ? `path:${artifact.path}` : `url:${artifact.url ?? artifact.title}`;
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
    key,
    title: entry.artifact.title,
    description: entry.artifact.description,
    path: entry.artifact.path,
    href: entry.artifact.path
      ? buildFileManagerHref({ path: entry.artifact.path, openInEditor: true })
      : (entry.artifact.url ?? "#"),
    external: !entry.artifact.path,
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

function isDueSoon(value: string): boolean {
  return new Date(value).getTime() - Date.now() < DUE_SOON_WINDOW_MS;
}

function formatDateOnly(value: string): string {
  return new Date(value).toLocaleDateString();
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

function formatSourceTemplate(task: Task): string {
  if (!task.sourceTemplateId) return "User-created task";
  return task.sourceOccurrenceAt
    ? `Generated ${formatDate(task.sourceOccurrenceAt)}`
    : "Generated from template";
}

function formatTaskModel(task: Task, agent?: Specialist): string {
  if (task.model) {
    return task.model;
  }
  return agent?.defaultModel
    ? `${agent.defaultModel} (specialist default)`
    : "Specialist's default";
}

/** True when the task pins a model that differs from its specialist default. */
function hasTaskModelOverride(task: Task, agent?: Specialist): boolean {
  return Boolean(task.model && task.model !== agent?.defaultModel);
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
          {run.resultText && run.resultText !== run.finalMessage ? (
            <div className={`mt-2 ${RESULT_BOX_CLASS}`}>
              <ClampedResultText
                className="mb-0.5 text-xs italic text-text-primary"
                text={run.resultText}
              />
            </div>
          ) : null}
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
