import { Markdown } from "@/components/chat/Markdown";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { TabBar } from "@/components/common/TabBar";
import { AcceptanceCriteriaList } from "@/components/tasks/AcceptanceCriteria";
import { TaskFeedbackPanelSection } from "@/components/tasks/task-feedback-section";
import { formatDate, formatToken, readAgentName } from "@/components/tasks/task-format";
import { StatusBadge } from "@/components/tasks/task-ui";
import { useSpecialistsQuery } from "@/hooks/use-specialists-query";
import {
  useTaskMutations,
  useTaskQuery,
  useTaskRunsQuery,
  useTaskSubtasksQuery,
} from "@/hooks/use-tasks-query";
import type { Specialist, Task, TaskRun, TaskSubtask } from "@cc/shared/schemas";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  aggregateRunArtifacts,
  buildTaskContextAttachmentHref,
  formatSchedule,
  formatSourceTemplate,
  formatTodoProgress,
  hasTaskResultSummary,
  readBoardStatus,
  readError,
  readLatestRunResult,
} from "./task-detail/task-detail-helpers";
import {
  Metric,
  PermissionSummary,
  RunHistory,
  TaskRunDetail,
  TextBlock,
} from "./task-detail/task-run-detail";

type TaskDetailPageProps = {
  mode?: "task" | "run";
};

type DetailSectionId = "overview" | "subtasks" | "runs" | "context";

const DETAIL_SECTION_TABS = [
  { id: "overview", label: "Overview" },
  { id: "subtasks", label: "Subtasks" },
  { id: "runs", label: "Runs" },
  { id: "context", label: "Context" },
];

export function TaskDetailPage(props: TaskDetailPageProps) {
  const params = useParams();
  const taskId = params["id"];
  const runId = params["runId"];
  const taskQuery = useTaskQuery(taskId);
  const agentsQuery = useSpecialistsQuery();
  const task = taskQuery.data;
  const agent = agentsQuery.data?.find((entry) => entry.id === task?.agentId);

  if (props.mode === "run") {
    return <TaskRunDetail agents={agentsQuery.data} task={task} taskId={taskId} runId={runId} />;
  }

  return (
    <TaskOverview
      task={task}
      agent={agent}
      agents={agentsQuery.data ?? []}
      isLoading={taskQuery.isLoading}
      error={taskQuery.error}
    />
  );
}

function TaskOverview(props: {
  task?: Task;
  agent?: Specialist;
  agents: Specialist[];
  isLoading: boolean;
  error: unknown;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const mutations = useTaskMutations();
  const runsQuery = useTaskRunsQuery(props.task?.id);
  const [selectedSectionId, setSelectedSectionId] = useState<DetailSectionId>();
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [actionError, setActionError] = useState<string>();
  const task = props.task;
  const activeSectionId = selectedSectionId ?? "overview";
  const latestRunResult = readLatestRunResult(runsQuery.data ?? []);

  useEffect(() => {
    if (!task || isTitleEditing) {
      return;
    }

    setTitleDraft(task.title);
  }, [isTitleEditing, task]);

  async function handleDuplicateTask(task: Task): Promise<void> {
    setActionError(undefined);

    try {
      const duplicated = await mutations.duplicate.mutateAsync(task.id);
      void navigate(`/tasks/${duplicated.id}/edit`);
    } catch (error) {
      setActionError(readError(error));
    }
  }

  return (
    <div className="grid gap-4" data-testid="task-detail-page">
      <section className="cc-panel p-6">
        <p className="cc-eyebrow">Tasks</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            {task && isTitleEditing ? (
              <form
                className="flex min-w-0 items-center gap-2"
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
                  className="cc-input min-w-0 flex-1 text-3xl font-semibold tracking-tight"
                  onChange={(event) => setTitleDraft(event.target.value)}
                  value={titleDraft}
                />
                <button
                  aria-label="Save title"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={mutations.update.isPending || !titleDraft.trim()}
                  type="submit"
                >
                  <Check aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  aria-label="Cancel title edit"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition hover:border-danger/40 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
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
              <h1 className="text-[33px] font-bold tracking-tight text-text-primary">
                <button
                  aria-label="Edit task title"
                  className="min-w-0 break-words rounded-md border border-transparent p-1 text-left transition hover:border-border hover:bg-surface focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 [overflow-wrap:anywhere]"
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
              </h1>
            )}
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Inspect task configuration, acceptance criteria, permission summary, and every run
              created by this task.
            </p>
          </div>
          {task ? (
            <div className="flex flex-wrap gap-2">
              <Link className="cc-button cc-button-secondary" to={`/tasks${location.search}`}>
                All tasks
              </Link>
              <Link className="cc-button cc-button-secondary" to={`/tasks/${task.id}/edit`}>
                Edit
              </Link>
              <button
                className="cc-button cc-button-secondary"
                onClick={() => void handleDuplicateTask(task)}
                type="button"
              >
                Duplicate
              </button>
              <button
                className="cc-button"
                onClick={() => mutations.trigger.mutate({ id: task.id })}
                type="button"
              >
                Run now
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {props.isLoading ? <LoadingState testId="task-detail-loading" /> : null}
      {props.error ? (
        <ErrorState description={readError(props.error)} title="Task could not be loaded." />
      ) : null}
      {actionError ? <ErrorState description={actionError} title="Task action failed." /> : null}
      {!props.isLoading && !task ? (
        <EmptyState description="This task no longer exists." title="Task not found" />
      ) : null}

      {task ? (
        <>
          <TaskDecisionSummary latestRunResult={latestRunResult?.content} task={task} />
          <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
            <article className="cc-panel min-w-0 overflow-hidden p-0">
              <TabBar
                activeTabId={activeSectionId}
                onTabChange={(tabId) => setSelectedSectionId(tabId as DetailSectionId)}
                tabs={DETAIL_SECTION_TABS}
                testIdPrefix="task-detail-tab"
              />
              <div className="min-w-0 p-5">
                <TaskDetailSectionContent
                  agent={props.agent}
                  agents={props.agents}
                  isRunsLoading={runsQuery.isLoading}
                  runs={runsQuery.data ?? []}
                  runsError={runsQuery.error}
                  sectionId={activeSectionId}
                  task={task}
                  taskId={task.id}
                  latestRunResult={latestRunResult?.content}
                />
              </div>
            </article>

            <aside className="cc-panel grid min-w-0 gap-4 p-5">
              <Metric label="Assigned specialist" value={props.agent?.name ?? task.agentId} />
              <Metric label="Schedule" value={formatSchedule(task)} />
              <Metric label="Latest result" value={latestRunResult?.content ?? "No runs yet"} />
              <Metric label="Acceptance criteria" value={formatTodoProgress(task)} />
            </aside>
          </section>

          <TaskRunOutcomeSummary runs={runsQuery.data ?? []} />
          <TaskFeedbackPanelSection
            agent={props.agent}
            agents={props.agents}
            runs={runsQuery.data ?? []}
            task={task}
            taskId={task.id}
          />
        </>
      ) : null}
    </div>
  );
}

function TaskDecisionSummary(props: { latestRunResult?: string; task: Task }) {
  const status = readBoardStatus(props.task);
  if (status !== "ready_to_check" && status !== "review" && status !== "failed") return null;
  const defaultContent =
    status === "ready_to_check"
      ? "The latest run completed successfully and is ready for acceptance."
      : status === "failed"
        ? "The system could not complete this task. Review the error and retry when ready."
        : "This task needs feedback or a retry before it can move forward.";
  const content = props.latestRunResult ?? defaultContent;
  const heading =
    status === "ready_to_check"
      ? "Ready to check"
      : status === "failed"
        ? "Failed"
        : "Review needed";

  return (
    <section className="cc-panel p-5">
      <h2 className="text-xl font-semibold text-text-primary">{heading}</h2>
      <Markdown
        className="mt-2 text-text-secondary [&_*:first-child]:mt-0 [&_*:last-child]:mb-0 [&_p]:whitespace-pre-wrap [&_p]:text-inherit"
        content={content}
      />
    </section>
  );
}

function TaskRunOutcomeSummary(props: { runs: TaskRun[] }) {
  const resultRuns = props.runs.filter(hasTaskResultSummary);
  const artifacts = aggregateRunArtifacts(props.runs);

  if (resultRuns.length === 0 && artifacts.length === 0) {
    return null;
  }

  return (
    <section className="cc-panel grid gap-5 p-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Task results and artifacts</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          Review what happened across all task runs and open generated files from the workspace.
        </p>
      </div>

      {resultRuns.length > 0 ? (
        <div className="grid gap-3">
          <h3 className="font-semibold text-text-primary">Results</h3>
          {resultRuns.map((run) => (
            <article className="rounded-lg border border-border bg-surface p-3" key={run.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                  <StatusBadge status={run.status} />
                  <span>{formatDate(run.completedAt ?? run.updatedAt)}</span>
                  <span>{formatToken(run.triggerSource)}</span>
                </div>
                <Link
                  className="font-medium text-accent underline-offset-4 hover:underline"
                  to={`/tasks/${run.taskId}/runs/${run.id}`}
                >
                  Open run
                </Link>
              </div>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {run.finalMessage ?? run.resultText ?? run.errorMessage ?? "No result summary."}
              </p>
              {run.needsHumanReview ? (
                <p className="mt-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm leading-6 text-text-primary">
                  {run.humanReviewReason ?? "Human review required."}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {artifacts.length > 0 ? (
        <div className="grid gap-3">
          <h3 className="font-semibold text-text-primary">Artifacts</h3>
          <div className="grid gap-2">
            {artifacts.map((artifact) => (
              <article
                className="rounded-lg border border-border bg-surface p-3"
                key={artifact.key}
              >
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
                  Latest:{" "}
                  {formatDate(artifact.latestRun.completedAt ?? artifact.latestRun.updatedAt)}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TaskDetailSectionContent(props: {
  sectionId: DetailSectionId;
  task: Task;
  taskId: string;
  latestRunResult?: string;
  agent?: Specialist;
  agents: Specialist[];
  runs: TaskRun[];
  isRunsLoading: boolean;
  runsError: unknown;
}) {
  const subtasksQuery = useTaskSubtasksQuery(props.taskId);
  const isSubtasksSection = props.sectionId === "subtasks";

  if (props.sectionId === "overview") {
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={props.task.status} />
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
            {props.task.enabled ? "Enabled" : "Disabled"}
          </span>
          {props.task.sourceTemplateId ? (
            <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs text-accent">
              {formatSourceTemplate(props.task)}
            </span>
          ) : null}
        </div>
        <PermissionSummary profile={props.task.permissionProfile} />
        <TaskTodos task={props.task} />
      </div>
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
      <div className="grid gap-4">
        {props.latestRunResult ? (
          <div className="rounded-lg border border-border bg-surface p-3 text-sm leading-6 text-text-secondary">
            <Markdown
              className="text-inherit [&_*:first-child]:mt-0 [&_*:last-child]:mb-0 [&_p]:whitespace-pre-wrap [&_p]:text-inherit"
              content={props.latestRunResult}
            />
          </div>
        ) : null}
        <RunHistory
          agents={props.agents}
          taskId={props.taskId}
          runs={props.runs}
          subtasks={subtasksQuery.data ?? []}
          isLoading={props.isRunsLoading}
          error={props.runsError}
        />
      </div>
    );
  }

  if (props.sectionId === "context") {
    return (
      <div className="grid gap-4">
        <TextBlock label="Task context" value={props.task.context.text || "No context provided."} />
        {props.task.context.attachments.length > 0 ? (
          <div className="grid gap-2">
            <h2 className="font-semibold text-text-primary">Attachments</h2>
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
                  · {attachment.mimeType}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  return null;
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
        <ErrorState description={readError(props.error)} title="Subtasks could not be loaded." />
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

function TaskTodos(props: { task: Task }) {
  if (props.task.todos.length === 0)
    return <p className="text-sm text-text-secondary">No acceptance criteria.</p>;

  return (
    <div>
      <h2 className="font-semibold text-text-primary">Acceptance criteria</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Your definition of done. The specialist sees these but can&apos;t check them off — verify
        and tick each one during review.
      </p>
      <AcceptanceCriteriaList className="mt-3" interactive task={props.task} />
    </div>
  );
}
