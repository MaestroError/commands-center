// Split out of TasksPage.tsx (issue #99).

import { Markdown } from "@/components/chat/Markdown";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { TabBar } from "@/components/common/TabBar";
import { TaskPromptComposer } from "@/components/tasks/TaskPromptComposer";
import { ArtifactGeneratedUrls } from "@/components/tasks/ArtifactGeneratedUrls";
import { ArtifactShareControls } from "@/components/tasks/ArtifactShareControls";
import { TaskFeedbackPanelSection } from "@/components/tasks/task-feedback-section";
import { formatDate, formatToken } from "@/components/tasks/task-format";
import {
  buildTaskPromptText,
  createTaskPromptValue,
  type TaskPromptValue,
} from "@/components/tasks/task-prompt";
import { StatusBadge } from "@/components/tasks/task-ui";
import { useSpecialistCatalogQuery } from "@/hooks/use-specialists-query";
import {
  useTaskMutations,
  useTaskQuery,
  useTaskRunsQuery,
  useTaskSubtasksQuery,
} from "@/hooks/use-tasks-query";
import type { Specialist, Task, TaskQueuePreview, TaskRun } from "@cc/shared/schemas";
import { Check, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { TaskTimingBadges } from "./TaskBoard";
import {
  TaskContextPanelSection,
  TaskOverviewDetails,
  TaskRunsSection,
  TaskSubtasksSection,
  TaskTodosPanelSection,
} from "./TaskDetailSections";
import {
  DETAIL_SECTION_TABS,
  type DetailSectionId,
  RESULT_BOX_CLASS,
  aggregateRunArtifacts,
  buildFullPageSearch,
  hasTaskModelOverride,
  readBoardStatus,
  readError,
  readLatestRunResult,
  readResultClassName,
  useTaskComposerSkills,
} from "./task-helpers";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TaskDetailPanel(props: {
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
                <Input
                  aria-label="Task title"
                  className="min-w-0 flex-1 text-3xl font-bold"
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
          <Button variant="secondary" onClick={props.onClose} type="button">
            Close
          </Button>
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
                      <Button
                        data-testid="task-prompt-save"
                        disabled={mutations.update.isPending}
                        type="submit"
                      >
                        {mutations.update.isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={mutations.update.isPending}
                        onClick={() => {
                          setPromptDraft(createTaskPromptValue(task.description));
                          setIsPromptEditing(false);
                        }}
                        type="button"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div
                    className="w-full min-w-0 break-words rounded-md border border-border bg-surface p-3 text-sm leading-6 text-text-secondary [overflow-wrap:anywhere]"
                    data-testid="task-prompt-display"
                  >
                    <div className="mb-3 flex justify-end">
                      <Button
                        variant="secondary"
                        aria-label="Edit task prompt"
                        data-testid="task-prompt-edit"
                        onClick={() => {
                          setPromptDraft(createTaskPromptValue(task.description));
                          setIsPromptEditing(true);
                        }}
                        type="button"
                      >
                        <Pencil aria-hidden="true" className="h-4 w-4" />
                        Edit prompt
                      </Button>
                    </div>
                    {task.description ? (
                      <Markdown
                        className="text-inherit [&_*:first-child]:mt-0 [&_*:last-child]:mb-0 [&_p]:whitespace-pre-wrap [&_p]:text-inherit"
                        content={task.description}
                      />
                    ) : (
                      "No description provided."
                    )}
                  </div>
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

              <TaskPanelArtifactSection runs={runsQuery.data ?? []} taskId={props.taskId} />

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
                  <Button
                    variant="secondary"
                    onClick={() => {
                      mutations.previewQueue.mutate(
                        { id: task.id },
                        { onSuccess: (preview) => setQueuePreview(preview) },
                      );
                    }}
                    type="button"
                  >
                    Preview context
                  </Button>
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
              className={buttonVariants({})}
              to={`/tasks/${task.id}${buildFullPageSearch(props.currentSearch)}`}
            >
              Open full page
            </Link>
            <Button
              variant="secondary"
              disabled={mutations.update.isPending}
              onClick={() => mutations.update.mutate({ id: task.id, input: { status: "backlog" } })}
              type="button"
            >
              Back to Backlog
            </Button>
            <Link
              className={buttonVariants({ variant: "secondary" })}
              to={`/tasks/${task.id}/edit${buildFullPageSearch(props.currentSearch)}`}
            >
              Edit
            </Link>
            <Button variant="secondary" onClick={props.onClose} type="button">
              Back to board
            </Button>
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
      <Button onClick={props.onRestore} type="button">
        Restore
      </Button>
    );
  }

  if (status === "queued" && props.activeRun) {
    return (
      <Link
        className={buttonVariants({})}
        to={`/tasks/${props.task.id}/runs/${props.activeRun.id}${props.currentSearch}`}
      >
        {props.activeRun.status === "running" ? "View active run" : "View queued run"}
      </Link>
    );
  }

  if (status === "ready_to_check") {
    return (
      <Button onClick={props.onAccept} type="button">
        Accept
      </Button>
    );
  }

  if (status === "failed") {
    return (
      <Button onClick={props.onQueue} type="button">
        Rerun
      </Button>
    );
  }

  if (status === "review") {
    return (
      <>
        <Button onClick={props.onAccept} type="button">
          Accept
        </Button>
        <Button variant="secondary" onClick={props.onQueue} type="button">
          Rerun
        </Button>
      </>
    );
  }

  if (status === "done") {
    return (
      <>
        <Button onClick={props.onArchive} type="button">
          Archive
        </Button>
        <Button variant="secondary" onClick={props.onReopen} type="button">
          Reopen
        </Button>
      </>
    );
  }

  return (
    <Button onClick={props.onQueue} type="button">
      {status === "scheduled" ? "Queue now" : "Queue"}
    </Button>
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

function TaskPanelArtifactSection(props: { runs: TaskRun[]; taskId: string }) {
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
                  {artifact.title}
                </a>
                <p className="mt-1 text-xs leading-5 text-text-muted [overflow-wrap:anywhere]">
                  {artifact.link}
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
            <ArtifactGeneratedUrls artifact={artifact.artifact} />
            <ArtifactShareControls artifact={artifact.artifact} taskId={props.taskId} />
          </article>
        ))}
      </div>
    </section>
  );
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
        <Button variant="secondary" onClick={() => setOpen((value) => !value)} type="button">
          {open ? "Hide" : "Show"}
        </Button>
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

export function RunHistory(props: {
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

export function TextBlock(props: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-text-secondary">{props.label}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-primary [overflow-wrap:anywhere]">
        {props.value}
      </p>
    </div>
  );
}

export function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs uppercase tracking-wide text-text-secondary">{props.label}</p>
      <p className="mt-1 truncate font-medium text-text-primary">{props.value}</p>
    </div>
  );
}
