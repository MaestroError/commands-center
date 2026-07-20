// Split out of TasksPage.tsx (issue #99).

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { RunTaskContextDialog } from "@/components/tasks/RunTaskContextDialog";
import { useSpecialistsQuery } from "@/hooks/use-specialists-query";
import {
  useActiveTaskRunsQuery,
  useArchivedTasksQuery,
  useTaskMutations,
  useTaskSchedulerStateQuery,
  useTaskTemplatesQuery,
  useTasksQuery,
} from "@/hooks/use-tasks-query";
import type { BoardTaskStatus, Task, TaskTemplate } from "@cc/shared/schemas";
import { Filter } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { TaskArchiveView } from "./TaskArchiveView";
import { TaskBoard, TaskScheduleDropDialog } from "./TaskBoard";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskTemplateDetailPanel, TaskTemplatesView } from "./TaskTemplatesView";
import {
  FILTER_SUGGESTIONS,
  TASK_VIEWS,
  type TaskView,
  clearSelectedTask,
  clearSelectedTemplate,
  filterTasks,
  filterTemplates,
  formatTaskView,
  hasUsableScheduledAt,
  readBoardStatus,
  readError,
  readFileAsDataUrl,
  readTaskView,
  selectGeneratedTask,
  setSelectedTask,
  setSelectedTemplate,
  setTaskView,
} from "./task-helpers";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TaskListPage() {
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
            <Button onClick={() => setIsCreatingTemplate(true)} type="button">
              Create template
            </Button>
          ) : (
            <Link className={buttonVariants({})} to="/tasks/new">
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
            <Button variant="secondary" onClick={() => void activeQuery.refetch()} type="button">
              Try again
            </Button>
          }
          description={error}
          title="Tasks could not be loaded."
        />
      ) : null}
      {actionError ? <ErrorState description={actionError} title="Task action failed." /> : null}
      {!isLoading && !error && view === "board" && boardTasks.length === 0 ? (
        <EmptyState
          action={
            <Link className={buttonVariants({})} to="/tasks/new">
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
          onDelete={(template) => void handleDeleteTemplate(template)}
          onCreateTask={(template) => {
            mutations.createFromTemplate.mutate(template.id, {
              onSuccess: (task) => selectGeneratedTask(searchParams, setSearchParams, task.id),
            });
          }}
          onToggleActive={(template) =>
            void (template.enabled ? mutations.disableTemplate : mutations.enableTemplate).mutate(
              template.id,
            )
          }
          toggleBusy={mutations.enableTemplate.isPending || mutations.disableTemplate.isPending}
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
          onDelete={(template) =>
            void handleDeleteTemplate(template, {
              onSuccess: () => clearSelectedTemplate(searchParams, setSearchParams),
            })
          }
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
      // Only completed or human-review tasks can be accepted; system failures
      // must be retried, not dismissed as done.
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

  function handleDeleteTemplate(
    template: TaskTemplate,
    options?: {
      onSuccess?: () => void;
    },
  ) {
    if (!window.confirm(`Delete template '${template.title}'?`)) {
      return;
    }

    mutations.remove.mutate(template.id, {
      onSuccess: options?.onSuccess,
    });
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
                ? "bg-accent text-on-accent"
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
        <Input
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
          <Button
            variant="secondary"
            className="h-8 px-3 text-xs"
            onClick={props.onClear}
            type="button"
          >
            Clear
          </Button>
        ) : null}
      </div>
    </section>
  );
}
