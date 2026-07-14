// Split out of TasksPage.tsx (issue #99).

import { SpecialistAvatar } from "@/components/specialists/specialist-avatar";
import { formatDate } from "@/components/tasks/task-format";
import { StatusBadge } from "@/components/tasks/task-ui";
import { useTaskSubtaskProgressQuery } from "@/hooks/use-tasks-query";
import { buildTemplateEndpointDocs } from "@cc/shared/lib";
import type {
  BoardTaskStatus,
  Specialist,
  Task,
  TaskRun,
  TaskSchedulerState,
  TaskSubtaskProgress,
  TaskTemplate,
} from "@cc/shared/schemas";
import {
  Archive,
  Calendar,
  CalendarClock,
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  Flag,
  Info,
  Link2,
  MessageSquareText,
  Pencil,
  Play,
  RotateCcw,
  Save,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { type DragEvent, useState } from "react";
import { Link } from "react-router-dom";
import {
  BOARD_COLUMNS,
  type TaskCardIconActionVariant,
  buildPanelSearch,
  canDropTaskOnStatus,
  formatDateOnly,
  formatResultMessagePreview,
  formatSubtaskDotLabel,
  formatSubtaskPreview,
  isConsumedScheduledAt,
  isDueSoon,
  readBoardStatus,
  readCardClassName,
  readColumnClassName,
  readColumnDropState,
  readSubtaskDotClassName,
  readTaskCardIconActionClassName,
  taskCardActionTestId,
} from "./task-helpers";

export function TaskBoard(props: {
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

          if (
            (column.status === "failed" || column.status === "review") &&
            columnTasks.length === 0
          ) {
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

export function TaskTimingBadges(props: {
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

export function TaskScheduleDropDialog(props: {
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
          aria-label={`Acceptance criteria: ${completedTodos}/${totalTodos} met`}
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

  if (props.boardStatus === "failed") {
    return (
      <>
        <TaskCardIconButton
          icon={RotateCcw}
          label="Rerun"
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

  if (props.boardStatus === "review") {
    return (
      <>
        <TaskCardIconButton
          icon={Check}
          label="Accept"
          onClick={props.onAccept}
          variant="success"
        />
        <TaskCardIconButton
          icon={RotateCcw}
          label="Rerun"
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

export function TaskCardIconButton(props: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  testId?: string;
  variant?: TaskCardIconActionVariant;
  disabled?: boolean;
}) {
  const Icon = props.icon;

  return (
    <button
      aria-label={props.label}
      className={readTaskCardIconActionClassName(props.variant)}
      data-testid={props.testId ?? taskCardActionTestId(props.label)}
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      <TaskCardIconActionTooltip label={props.label} />
    </button>
  );
}

export function TemplateDisabledBadge() {
  return (
    <span
      className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-sm text-warning"
      data-testid="task-template-disabled-badge"
    >
      Disabled
    </span>
  );
}

export function CopyEndpointButton(props: { template: TaskTemplate }) {
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
