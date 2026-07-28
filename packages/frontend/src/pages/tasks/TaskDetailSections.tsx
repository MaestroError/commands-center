// Split out of TasksPage.tsx (issue #99).

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { AcceptanceCriteriaList } from "@/components/tasks/AcceptanceCriteria";
import { formatDate, formatToken } from "@/components/tasks/task-format";
import { StatusBadge } from "@/components/tasks/task-ui";
import { useTaskMutations } from "@/hooks/use-tasks-query";
import type { Specialist, Task, TaskRun, TaskSubtask } from "@cc/shared/schemas";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { type ChangeEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { RunHistory } from "./TaskDetailPanel";
import {
  buildTaskContextAttachmentHref,
  buildTaskTodoInputs,
  formatBytes,
  formatSchedule,
  formatSourceTemplate,
  formatTaskContextSummary,
  formatTaskModel,
  formatTodoItemsText,
  formatTodoProgress,
  readAgentName,
  readBoardStatus,
  readError,
  readResultClassName,
  usePersistentTaskContextOpen,
  usePersistentTaskSectionOpen,
} from "./task-helpers";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function TaskSubtasksSection(props: {
  agents: Specialist[];
  subtasks: TaskSubtask[];
  runs: TaskRun[];
  taskId: string;
  isLoading: boolean;
  error: unknown;
}) {
  return (
    <section aria-label="Task subtasks" className="grid gap-4">
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
    </section>
  );
}

export function TaskOverviewDetails(props: { task: Task; agent?: Specialist }) {
  const rows = [
    { label: "Status", value: formatToken(readBoardStatus(props.task)) },
    { label: "Specialist", value: props.agent?.name ?? props.task.agentId },
    { label: "Model", value: formatTaskModel(props.task, props.agent) },
    { label: "Schedule", value: formatSchedule(props.task) },
    { label: "Source", value: formatSourceTemplate(props.task) },
    { label: "Acceptance criteria", value: formatTodoProgress(props.task) },
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

export function TaskRunsSection(props: {
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
        <Link
          className={buttonVariants({ className: "w-fit" })}
          to={`/tasks/${props.taskId}/runs/${props.activeRun.id}`}
        >
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

export function TaskContextPanelSection(props: {
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
                <Textarea
                  className="min-h-32 resize-y"
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Optional persistent context for future task runs..."
                  value={text}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button disabled={props.isSaving} onClick={handleSaveText} type="button">
                  {props.isSaving ? "Saving..." : "Save context"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={props.isSaving}
                  onClick={handleCancelText}
                  type="button"
                >
                  Cancel
                </Button>
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
            <label
              className={buttonVariants({ variant: "secondary", className: "cursor-pointer" })}
            >
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

export function TaskTodos(props: { task: Task }) {
  if (props.task.todos.length === 0) {
    return <p className="text-sm text-text-secondary">No acceptance criteria.</p>;
  }

  return (
    <div>
      <h3 className="font-semibold text-text-primary">Acceptance criteria</h3>
      <AcceptanceCriteriaList className="mt-3" task={props.task} />
    </div>
  );
}

export function TaskTodosPanelSection(props: { task: Task }) {
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
          <span className="block font-semibold text-text-primary">Acceptance criteria</span>
          <span className="mt-1 block text-sm text-text-secondary">
            {formatTodoProgress(props.task)} met
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
                Acceptance criteria, one per line
                <Textarea
                  aria-label="Acceptance criteria"
                  className="min-h-28 resize-y"
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
                <Button disabled={mutations.update.isPending} type="submit">
                  {mutations.update.isPending ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={mutations.update.isPending}
                  onClick={() => {
                    setTodosText(formatTodoItemsText(props.task));
                    setIsEditing(false);
                  }}
                  type="button"
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-text-secondary">
                Your definition of done. The specialist sees these but can&apos;t check them off —
                tick each one as you verify it during review.
              </p>
              <AcceptanceCriteriaList interactive task={props.task} />
              <div>
                <Button variant="secondary" onClick={() => setIsEditing(true)} type="button">
                  Edit criteria
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
