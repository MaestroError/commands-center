import { Fragment, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import type {
  Specialist,
  SpecialistCatalog,
  CreateTaskFeedbackInput,
  ConversationMessage,
  ConversationPart,
  Task,
  TaskFeedbackThread,
  TaskPermissionProfile,
  TaskRun,
  TaskRunArtifact,
  TaskRunFollowup,
  TaskSubtask,
} from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { TabBar } from "@/components/common/TabBar";
import { Markdown } from "@/components/chat/Markdown";
import { AcceptanceCriteriaList } from "@/components/tasks/AcceptanceCriteria";
import { ArtifactShareControls } from "@/components/tasks/ArtifactShareControls";
import { TaskPromptComposer } from "@/components/tasks/TaskPromptComposer";
import { formatDate, formatToken } from "@/components/tasks/task-format";
import {
  buildTaskPromptText,
  createTaskPromptValue,
  type TaskPromptValue,
} from "@/components/tasks/task-prompt";
import { StatusBadge } from "@/components/tasks/task-ui";
import { SpecialistAvatar } from "@/components/specialists/specialist-avatar";
import { useSpecialistCatalogQuery, useSpecialistsQuery } from "@/hooks/use-specialists-query";
import {
  useTaskMutations,
  useTaskFeedbackQuery,
  useTaskQuery,
  useTaskRunQuery,
  useTaskRunFollowupsQuery,
  useTaskRunsQuery,
  useTaskSubtasksQuery,
  useTaskRunSessionQuery,
} from "@/hooks/use-tasks-query";
import { buildFileManagerHref } from "@/lib/file-manager-href";

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

function RunHistory(props: {
  taskId: string;
  runs: TaskRun[];
  agents?: Specialist[];
  subtasks?: TaskSubtask[];
  isLoading: boolean;
  error: unknown;
}) {
  const [openReplyRunId, setOpenReplyRunId] = useState<string>();

  return (
    <section className="cc-panel min-w-0 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Run history</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Review prompts, results, errors, permissions, and task-owned chat sessions.
          </p>
        </div>
      </div>
      {props.isLoading ? <LoadingState testId="task-runs-loading" /> : null}
      {props.error ? (
        <ErrorState description={readError(props.error)} title="Runs could not be loaded." />
      ) : null}
      {!props.isLoading && props.runs.length === 0 ? (
        <EmptyState
          description="Manual and scheduled executions will appear here after the task runs."
          title="No runs yet"
        />
      ) : null}
      {props.runs.length > 0 ? (
        <div className="mt-4 max-w-full overflow-x-auto">
          <table className="w-full min-w-[72rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-text-secondary">
              <tr className="border-b border-border">
                <th className="py-3 pr-3">Status</th>
                <th className="py-3 pr-3">Specialist</th>
                <th className="py-3 pr-3">Outcome</th>
                <th className="py-3 pr-3">Trigger</th>
                <th className="py-3 pr-3">Target</th>
                <th className="py-3 pr-3">Started</th>
                <th className="py-3 pr-3">Duration</th>
                <th className="py-3 pr-3">Artifacts</th>
                <th className="py-3 pr-3">Session</th>
                <th className="py-3 pr-3">Summary</th>
                <th className="py-3 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {props.runs.map((run) => (
                <Fragment key={run.id}>
                  <tr className="border-b border-border/70" data-testid={`task-run-row-${run.id}`}>
                    <td className="py-3 pr-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="py-3 pr-3 text-text-secondary">
                      {readAgentName(props.agents ?? [], run.agentId)}
                    </td>
                    <td className="py-3 pr-3 text-text-secondary">
                      {run.outcome ? formatToken(run.outcome) : "-"}
                    </td>
                    <td className="py-3 pr-3 text-text-secondary">
                      {formatToken(run.triggerSource)}
                    </td>
                    <td className="max-w-48 truncate py-3 pr-3 text-text-secondary">
                      {formatRunTarget(run, props.subtasks ?? [])}
                    </td>
                    <td className="py-3 pr-3 text-text-secondary">{formatDate(run.startedAt)}</td>
                    <td className="py-3 pr-3 text-text-secondary">{formatRunDuration(run)}</td>
                    <td className="py-3 pr-3 text-text-secondary">{run.artifacts.length}</td>
                    <td className="py-3 pr-3 text-text-secondary">
                      {run.opencodeSessionId ? "Recorded" : "Unavailable"}
                    </td>
                    <td className="max-w-sm truncate py-3 pr-3 text-text-secondary">
                      {run.finalMessage ?? run.errorMessage ?? "No summary"}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          className="cc-button cc-button-secondary"
                          data-testid={`task-run-inspect-${run.id}`}
                          to={`/tasks/${props.taskId}/runs/${run.id}`}
                        >
                          Inspect
                        </Link>
                        <button
                          className="cc-button cc-button-secondary"
                          data-testid={`task-run-reply-${run.id}`}
                          onClick={() =>
                            setOpenReplyRunId((current) =>
                              current === run.id ? undefined : run.id,
                            )
                          }
                          type="button"
                        >
                          Reply
                        </button>
                      </div>
                    </td>
                  </tr>
                  {openReplyRunId === run.id ? (
                    <tr className="border-b border-border/70">
                      <td className="py-3 pr-3" colSpan={11}>
                        <RunReplyPanel run={run} taskId={props.taskId} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
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
  const isSubmittingFeedback = mutations.createFeedback.isPending || mutations.trigger.isPending;

  return (
    <section
      className="cc-panel grid gap-4 p-5"
      aria-label="Feedback comments"
      data-testid="task-feedback-section"
    >
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Feedback</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Comments, follow-up requests, and specialist replies for this task.
        </p>
      </div>
      <TaskFeedbackSection
        agents={props.agents}
        error={feedbackQuery.error}
        feedback={feedbackQuery.data ?? []}
        isLoading={feedbackQuery.isLoading}
        isSubmitting={isSubmittingFeedback}
        isUpdatingFeedback={mutations.updateFeedback.isPending}
        onSubmit={async (input, options) => {
          await mutations.createFeedback.mutateAsync({ id: props.taskId, input });

          if (options.requeue) {
            await mutations.trigger.mutateAsync({ id: props.taskId });
          }

          options.onSuccess();
        }}
        onUpdateFeedback={(feedbackId, input) =>
          mutations.updateFeedback.mutateAsync({
            taskId: props.taskId,
            feedbackId,
            input,
          })
        }
        parentRuns={props.runs}
        skills={feedbackSkills}
        task={props.task}
      />
    </section>
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
  isUpdatingFeedback: boolean;
  onSubmit: (
    input: CreateTaskFeedbackInput,
    options: { requeue: boolean; onSuccess: () => void },
  ) => Promise<void>;
  onUpdateFeedback: (feedbackId: string, input: { body: string }) => Promise<unknown>;
}) {
  const [prompt, setPrompt] = useState<TaskPromptValue>(() => createTaskPromptValue());
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingFeedbackId, setEditingFeedbackId] = useState<string>();
  const [editingFeedbackBody, setEditingFeedbackBody] = useState("");
  const [feedbackError, setFeedbackError] = useState<string>();
  const timelineItems = buildFeedbackTimelineItems(props.feedback, props.parentRuns);

  async function submitFeedback(requeue: boolean): Promise<void> {
    const body = buildTaskPromptText(prompt);

    if (!body) return;

    setFeedbackError(undefined);

    try {
      await props.onSubmit(
        {
          body,
          mentionedAgentIds: prompt.mentionedAgents.map((agent) => agent.id),
        },
        {
          requeue,
          onSuccess: () => {
            setPrompt(createTaskPromptValue());
            setIsEditorOpen(false);
          },
        },
      );
    } catch (error) {
      setFeedbackError(readError(error));
    }
  }

  async function updateFeedback(feedbackId: string): Promise<void> {
    const body = editingFeedbackBody.trim();

    if (!body) return;

    setFeedbackError(undefined);

    try {
      await props.onUpdateFeedback(feedbackId, { body });
      setEditingFeedbackId(undefined);
      setEditingFeedbackBody("");
    } catch (error) {
      setFeedbackError(readError(error));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitFeedback(false);
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
          <p className="text-xs text-text-secondary">
            If no agent is mentioned, feedback creates one subtask for the task default agent.
          </p>
          <SendButtons
            disabled={!buildTaskPromptText(prompt)}
            isRequeueing={props.isSubmitting}
            isSending={props.isSubmitting}
            onSend={() => void submitFeedback(false)}
            onSendAndRequeue={() => void submitFeedback(true)}
            requeueTestId="task-feedback-submit-requeue"
            sendTestId="task-feedback-submit"
          />
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

      {feedbackError ? (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {feedbackError}
        </p>
      ) : null}

      {props.isLoading ? <LoadingState testId="task-feedback-loading" /> : null}
      {props.error ? (
        <ErrorState description={readError(props.error)} title="Feedback could not be loaded." />
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
              const isEditing = editingFeedbackId === entry.id;
              const canEdit = canEditFeedback(entry, props.parentRuns);
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
                        {canEdit ? (
                          <button
                            className="font-medium text-accent underline-offset-4 hover:underline"
                            onClick={() => {
                              setEditingFeedbackId(entry.id);
                              setEditingFeedbackBody(entry.body);
                            }}
                            type="button"
                          >
                            Edit
                          </button>
                        ) : null}
                      </>
                    }
                    tone="operator"
                  >
                    {isEditing ? (
                      <div className="mt-3 grid gap-2">
                        <textarea
                          aria-label="Edit feedback"
                          className="cc-input min-h-24"
                          onChange={(event) => setEditingFeedbackBody(event.target.value)}
                          value={editingFeedbackBody}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="cc-button"
                            disabled={props.isUpdatingFeedback || !editingFeedbackBody.trim()}
                            onClick={() => void updateFeedback(entry.id)}
                            type="button"
                          >
                            Save
                          </button>
                          <button
                            className="cc-button cc-button-secondary"
                            disabled={props.isUpdatingFeedback}
                            onClick={() => {
                              setEditingFeedbackId(undefined);
                              setEditingFeedbackBody("");
                            }}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </FeedbackComment>
                  <FeedbackReplies agents={props.agents} subtasks={entry.subtasks} />
                </article>
              );
            }

            const run = item.run;
            const agent = props.agents.find((entry) => entry.id === run.agentId);
            return (
              <FeedbackComment
                author={`${agent?.name ?? run.agentId} commented`}
                agent={agent}
                body={readRunCommentBody(run)}
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
              >
                <RunReplyPanel run={run} taskId={props.task.id} />
              </FeedbackComment>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SendButtons(props: {
  disabled?: boolean;
  isSending?: boolean;
  isRequeueing?: boolean;
  onSend: () => void;
  onSendAndRequeue: () => void;
  sendTestId?: string;
  requeueTestId?: string;
}) {
  const isBusy = Boolean(props.isSending || props.isRequeueing);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="cc-button cc-button-secondary"
        data-testid={props.sendTestId}
        disabled={props.disabled || isBusy}
        onClick={props.onSend}
        type="button"
      >
        {props.isSending ? "Sending..." : "Send"}
      </button>
      <button
        className="cc-button"
        data-testid={props.requeueTestId}
        disabled={props.disabled || isBusy}
        onClick={props.onSendAndRequeue}
        type="button"
      >
        {props.isRequeueing ? "Sending..." : "Send & requeue"}
      </button>
    </div>
  );
}

function RunReplyPanel(props: { taskId: string; run: TaskRun }) {
  const followupsQuery = useTaskRunFollowupsQuery(props.taskId, props.run.id);
  const mutations = useTaskMutations();
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [body, setBody] = useState("");
  const [editingFollowupId, setEditingFollowupId] = useState<string>();
  const [editingBody, setEditingBody] = useState("");
  const [error, setError] = useState<string>();

  async function submit(requeue: boolean): Promise<void> {
    const trimmedBody = body.trim();

    if (!trimmedBody) return;

    setError(undefined);

    try {
      await mutations.createRunFollowup.mutateAsync({
        taskId: props.taskId,
        runId: props.run.id,
        input: { body: trimmedBody },
      });

      if (requeue) {
        await mutations.continueRun.mutateAsync({ taskId: props.taskId, runId: props.run.id });
      }

      setBody("");
      setIsComposerOpen(false);
    } catch (submitError) {
      setError(readError(submitError));
    }
  }

  async function updateFollowup(followupId: string): Promise<void> {
    const trimmedBody = editingBody.trim();

    if (!trimmedBody) return;

    setError(undefined);

    try {
      await mutations.updateRunFollowup.mutateAsync({
        taskId: props.taskId,
        runId: props.run.id,
        followupId,
        input: { body: trimmedBody },
      });
      setEditingFollowupId(undefined);
      setEditingBody("");
    } catch (updateError) {
      setError(readError(updateError));
    }
  }

  async function deleteFollowup(followupId: string): Promise<void> {
    setError(undefined);

    try {
      await mutations.deleteRunFollowup.mutateAsync({
        taskId: props.taskId,
        runId: props.run.id,
        followupId,
      });
    } catch (deleteError) {
      setError(readError(deleteError));
    }
  }

  const followups = followupsQuery.data ?? [];
  const pendingCount = followups.filter((followup) => followup.status === "pending").length;
  const isSending = mutations.createRunFollowup.isPending || mutations.continueRun.isPending;

  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text-primary">Reply to this run</p>
          <p className="text-xs text-text-secondary">
            Replies are delivered into this run&apos;s existing session when it is requeued.
          </p>
        </div>
        <button
          className="cc-button cc-button-secondary"
          onClick={() => setIsComposerOpen((current) => !current)}
          type="button"
        >
          Reply
        </button>
      </div>

      {isComposerOpen ? (
        <div className="grid gap-2">
          <textarea
            aria-label={`Reply to run ${props.run.id}`}
            className="cc-input min-h-24"
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add a short follow-up for the specialist."
            value={body}
          />
          <SendButtons
            disabled={!body.trim()}
            isRequeueing={isSending}
            isSending={isSending}
            onSend={() => void submit(false)}
            onSendAndRequeue={() => void submit(true)}
            requeueTestId={`task-run-reply-requeue-${props.run.id}`}
            sendTestId={`task-run-reply-send-${props.run.id}`}
          />
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {followupsQuery.isLoading ? (
        <p className="text-xs text-text-secondary">Loading replies...</p>
      ) : null}
      {followups.length > 0 ? (
        <div aria-label={pendingCount > 0 ? "Pending replies" : "Replies"} className="grid gap-2">
          {followups.map((followup) => (
            <RunFollowupItem
              editingBody={editingBody}
              editingFollowupId={editingFollowupId}
              followup={followup}
              isDeleting={mutations.deleteRunFollowup.isPending}
              isUpdating={mutations.updateRunFollowup.isPending}
              key={followup.id}
              onCancelEdit={() => {
                setEditingFollowupId(undefined);
                setEditingBody("");
              }}
              onDelete={() => void deleteFollowup(followup.id)}
              onEditingBodyChange={setEditingBody}
              onSave={() => void updateFollowup(followup.id)}
              onStartEdit={() => {
                setEditingFollowupId(followup.id);
                setEditingBody(followup.body);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RunFollowupItem(props: {
  followup: TaskRunFollowup;
  editingFollowupId?: string;
  editingBody: string;
  isUpdating: boolean;
  isDeleting: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditingBodyChange: (body: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const isEditing = props.editingFollowupId === props.followup.id;
  const isPending = props.followup.status === "pending";

  return (
    <article className="rounded-md border border-border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-text-secondary">
          {formatToken(props.followup.status)}
        </span>
        {isPending && !isEditing ? (
          <div className="flex flex-wrap gap-2">
            <button
              className="font-medium text-accent underline-offset-4 hover:underline"
              onClick={props.onStartEdit}
              type="button"
            >
              Edit
            </button>
            <button
              className="font-medium text-danger underline-offset-4 hover:underline"
              disabled={props.isDeleting}
              onClick={props.onDelete}
              type="button"
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
      {isEditing ? (
        <div className="mt-2 grid gap-2">
          <textarea
            aria-label="Edit pending reply"
            className="cc-input min-h-20"
            onChange={(event) => props.onEditingBodyChange(event.target.value)}
            value={props.editingBody}
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="cc-button"
              disabled={props.isUpdating || !props.editingBody.trim()}
              onClick={props.onSave}
              type="button"
            >
              Save
            </button>
            <button
              className="cc-button cc-button-secondary"
              disabled={props.isUpdating}
              onClick={props.onCancelEdit}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 leading-6 text-text-secondary">{props.followup.body}</p>
      )}
    </article>
  );
}

function canEditFeedback(entry: TaskFeedbackThread, parentRuns: TaskRun[]): boolean {
  if (entry.subtasks.length === 0) {
    return true;
  }

  const subtaskIds = new Set(entry.subtasks.map((subtask) => subtask.id));

  return (
    !entry.subtasks.some(
      (subtask) => subtask.latestRun || subtask.replies.length > 0 || subtask.status !== "backlog",
    ) && !parentRuns.some((run) => run.subtaskId && subtaskIds.has(run.subtaskId))
  );
}

function FeedbackComment(props: {
  author: string;
  agent?: Specialist;
  body: string;
  artifacts?: TaskRunArtifact[];
  taskId?: string;
  runId?: string;
  meta: ReactNode;
  tone: "operator" | "agent";
  children?: ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-surface-elevated p-3 shadow-sm">
      {props.agent ? (
        <SpecialistAvatar iconPath={props.agent.iconPath} name={props.agent.name} size="sm" />
      ) : (
        <div
          aria-hidden="true"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
            props.tone === "agent"
              ? "bg-accent/15 text-accent"
              : "bg-surface-muted text-text-primary"
          }`}
        >
          {props.author.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span className="font-medium text-text-primary">{props.author}</span>
          {props.meta}
        </div>
        <Markdown
          className="mt-1 text-sm leading-6 text-text-secondary [&_*:first-child]:mt-0 [&_*:last-child]:mb-0 [&_p]:whitespace-pre-wrap [&_p]:text-inherit"
          content={props.body}
        />
        <RunArtifactAttachments
          artifacts={props.artifacts ?? []}
          taskId={props.taskId}
          runId={props.runId}
        />
        {props.children}
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
        const href =
          artifact.type === "file"
            ? buildFileManagerHref({ path: artifact.link, openInEditor: true })
            : artifact.link;
        return (
          <li
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary"
            key={`${artifact.type}:${artifact.link}:${artifact.title}`}
          >
            <span className="min-w-0">
              <a
                className="break-words font-medium text-accent underline-offset-4 hover:underline [overflow-wrap:anywhere]"
                href={href}
                rel="noreferrer"
                target={artifact.type === "file" ? undefined : "_blank"}
              >
                {artifact.title}
              </a>
              <span className="block text-xs text-text-muted [overflow-wrap:anywhere]">
                {artifact.link}
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
      {replies.map((reply) => {
        const agent = props.agents.find((entry) => entry.id === reply.agentId);
        return (
          <FeedbackComment
            author={`${agent?.name ?? reply.agentId} replied`}
            agent={agent}
            body={readRunCommentBody(reply.run)}
            key={reply.run.id}
            meta={
              <>
                <StatusBadge status={reply.status} />
                <span>{formatDate(reply.run.completedAt ?? reply.run.updatedAt)}</span>
                <Link
                  className="font-medium text-accent underline-offset-4 hover:underline"
                  to={`/tasks/${reply.run.taskId}/runs/${reply.run.id}`}
                >
                  Open run
                </Link>
              </>
            }
            artifacts={reply.run.artifacts}
            taskId={reply.run.taskId}
            runId={reply.run.id}
            tone="agent"
          />
        );
      })}
    </div>
  );
}

function buildTaskContextAttachmentHref(storageKey: string): string {
  return buildFileManagerHref({
    root: "workspace",
    path: `sessions/${storageKey}`,
    openInEditor: true,
  });
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

function TaskRunDetail(props: {
  task?: Task;
  taskId?: string;
  runId?: string;
  agents?: Specialist[];
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const runQuery = useTaskRunQuery(props.taskId, props.runId);
  const sessionQuery = useTaskRunSessionQuery(props.taskId, props.runId);
  const mutations = useTaskMutations();
  const [activeTabId, setActiveTabId] = useState<"session" | "details">("session");
  const run = runQuery.data;
  const agentSlug = props.agents?.find(
    (entry) => entry.id === (run?.agentId ?? props.task?.agentId),
  )?.slug;

  return (
    <div className="grid gap-4" data-testid="task-run-inspector">
      <PageHeader
        actions={
          <>
            <Link
              className="cc-button cc-button-secondary"
              to={
                props.taskId
                  ? `/tasks/${props.taskId}${location.search}`
                  : `/tasks${location.search}`
              }
            >
              Back to task
            </Link>
            {sessionQuery.data?.canOpenInChat && props.taskId && props.runId && agentSlug ? (
              <button className="cc-button" onClick={() => void openInChat()} type="button">
                Continue in chat
              </button>
            ) : null}
          </>
        }
        description="Audit the exact prompt, result, errors, effective permissions, and task-owned OpenCode session for this run."
        eyebrow="Task Run"
        title={props.task?.title ?? "Run detail"}
      />

      {runQuery.isLoading ? <LoadingState testId="task-run-loading" /> : null}
      {runQuery.error ? (
        <ErrorState description={readError(runQuery.error)} title="Run could not be loaded." />
      ) : null}
      {run ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
          <article className="cc-panel overflow-hidden p-0">
            <TabBar
              activeTabId={activeTabId}
              onTabChange={(tabId) => {
                if (tabId === "session" || tabId === "details") {
                  setActiveTabId(tabId);
                }
              }}
              tabs={[
                { id: "session", label: "Session" },
                { id: "details", label: "Details" },
              ]}
              testIdPrefix="task-run-tab"
            />

            <div className="p-5">
              {activeTabId === "session" ? (
                <TaskRunSessionTab
                  conversation={sessionQuery.data?.conversation}
                  diagnostics={sessionQuery.data?.diagnostics ?? []}
                  isLoading={sessionQuery.isLoading}
                  run={run}
                />
              ) : null}

              {activeTabId === "details" ? (
                <TaskRunDetailsTab diagnostics={sessionQuery.data?.diagnostics ?? []} run={run} />
              ) : null}
            </div>
          </article>

          <aside className="cc-panel grid content-start gap-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={run.status} />
              <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
                {formatToken(run.triggerSource)}
              </span>
            </div>
            <Metric label="Started" value={formatDate(run.startedAt)} />
            <Metric label="Completed" value={formatDate(run.completedAt)} />
            <Metric label="Session" value={run.opencodeSessionId ?? "No session"} />
            {sessionQuery.data?.conversation?.convertedAt ? (
              <Metric
                label="Chat"
                value={`Continued ${formatDate(sessionQuery.data.conversation.convertedAt)}`}
              />
            ) : null}
            {run.errorMessage ? <TextBlock label="Error" value={run.errorMessage} /> : null}
            <JsonBlock label="Error details" value={run.errorDetails} />
          </aside>
        </section>
      ) : null}
    </div>
  );

  async function openInChat() {
    if (!props.taskId || !props.runId || !agentSlug) return;
    const snapshot = await mutations.openInChat.mutateAsync({
      taskId: props.taskId,
      runId: props.runId,
    });
    void navigate(
      `/chat/${encodeURIComponent(agentSlug)}/${encodeURIComponent(snapshot.current.id)}`,
    );
  }
}

function TaskRunSessionTab(props: {
  run: TaskRun;
  conversation?: { messages: ConversationMessage[] };
  diagnostics: Array<{ code: string; message: string }>;
  isLoading: boolean;
}) {
  const [logOpen, setLogOpen] = useState(false);
  const messageCount =
    props.conversation?.messages.length ?? readResultMessageCount(props.run.result) ?? 0;

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-xl border border-border bg-surface p-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Session</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Review the run summary first, then inspect the recorded session without leaving this
            page.
          </p>
        </div>
        <Metric
          label="Summary"
          value={props.run.finalMessage ?? props.run.errorMessage ?? "No summary"}
        />
        <Metric label="Result" value={props.run.resultText ?? "No result text set."} />
        <Metric
          label="Human review"
          value={
            props.run.needsHumanReview
              ? (props.run.humanReviewReason ?? "Required")
              : "Not required"
          }
        />
        <JsonBlock label="Artifacts" value={props.run.artifacts} />
        <Metric label="Messages" value={String(messageCount)} />
        {props.diagnostics.length ? (
          <JsonBlock label="Session diagnostics" value={props.diagnostics} />
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <button
          aria-expanded={logOpen}
          className="flex w-full items-start justify-between gap-3 text-left"
          data-testid="task-run-session-log"
          onClick={() => setLogOpen((current) => !current)}
          type="button"
        >
          <span>
            <span className="block text-lg font-semibold text-text-primary">Session log</span>
            <span className="mt-1 block text-sm text-text-secondary">
              Read the task session exactly as it ran, without converting it into chat.
            </span>
          </span>
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-sm text-text-secondary">
            {logOpen ? "-" : "+"}
          </span>
        </button>

        {logOpen ? <div className="mt-4">{renderSessionLogContent(props)}</div> : null}
      </section>
    </div>
  );
}

function TaskRunDetailsTab(props: {
  run: TaskRun;
  diagnostics: Array<{ code: string; message: string }>;
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  return (
    <div className="grid gap-5">
      <CollapsibleRunContextBlock
        isOpen={promptOpen}
        label="Rendered prompt"
        onToggle={() => setPromptOpen((current) => !current)}
      >
        <TextBlock value={props.run.renderedPrompt || "No prompt recorded."} code />
      </CollapsibleRunContextBlock>
      <CollapsibleRunContextBlock
        isOpen={contextOpen}
        label="Rendered context"
        onToggle={() => setContextOpen((current) => !current)}
      >
        <JsonBlock value={props.run.renderedContext} />
      </CollapsibleRunContextBlock>
      <TextBlock label="Result text" value={props.run.resultText ?? "No result text set."} />
      <JsonBlock label="Artifacts" value={props.run.artifacts} />
      <Metric
        label="Human review"
        value={
          props.run.needsHumanReview ? (props.run.humanReviewReason ?? "Required") : "Not required"
        }
      />
      <JsonBlock label="Result" value={props.run.result} />
      <JsonBlock label="Effective permissions" value={props.run.effectivePermissions} />
      {props.diagnostics.length ? (
        <JsonBlock label="Session diagnostics" value={props.diagnostics} />
      ) : null}
    </div>
  );
}

function CollapsibleRunContextBlock(props: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <button
        aria-expanded={props.isOpen}
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={props.onToggle}
        type="button"
      >
        <span className="font-semibold text-text-primary">{props.label}</span>
        <span className="text-sm text-text-secondary">{props.isOpen ? "Hide" : "Show"}</span>
      </button>
      {props.isOpen ? <div className="mt-3">{props.children}</div> : null}
    </section>
  );
}

function renderSessionLogContent(props: {
  conversation?: { messages: ConversationMessage[] };
  diagnostics: Array<{ code: string; message: string }>;
  isLoading: boolean;
}) {
  if (props.isLoading) {
    return <LoadingState testId="task-run-session-loading" />;
  }

  if (props.conversation?.messages.length) {
    return (
      <div className="grid gap-3">
        {props.conversation.messages.map((message) => (
          <SessionLogEntry key={message.id} message={message} />
        ))}
      </div>
    );
  }

  if (!props.conversation?.messages.length && props.diagnostics.length === 0) {
    return (
      <EmptyState
        description="This run has a recorded session, but no messages were captured."
        title="No session messages"
      />
    );
  }

  return (
    <EmptyState
      description="The task session could not be rendered. Review the diagnostics in the summary above."
      title="Session unavailable"
    />
  );
}

function SessionLogEntry(props: { message: ConversationMessage }) {
  const toolParts = props.message.parts.filter(isToolPart);
  const hasTextContent = props.message.content.trim().length > 0;

  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs uppercase tracking-wide text-text-secondary">
          {props.message.role}
        </span>
        <span className="text-xs text-text-secondary">{formatDate(props.message.createdAt)}</span>
      </div>
      {hasTextContent ? (
        <pre className="mt-3 overflow-auto text-sm leading-6 text-text-primary whitespace-pre-wrap">
          {props.message.content}
        </pre>
      ) : null}

      {toolParts.length ? (
        <div className="mt-3 grid gap-3">
          {toolParts.map((part) => (
            <ToolLogBlock key={part.id} part={part} />
          ))}
        </div>
      ) : null}

      {!hasTextContent && toolParts.length === 0 ? (
        <pre className="mt-3 overflow-auto text-sm leading-6 text-text-primary whitespace-pre-wrap">
          (no text content)
        </pre>
      ) : null}

      {props.message.attachments.length ? (
        <p className="mt-3 text-xs text-text-secondary">
          Attachments:{" "}
          {props.message.attachments
            .map((attachment) => attachment.filename ?? attachment.mimeType)
            .join(", ")}
        </p>
      ) : null}
      {props.message.error ? (
        <p className="mt-3 text-xs text-danger">
          {props.message.error.name}: {props.message.error.message}
        </p>
      ) : null}
    </article>
  );
}

function ToolLogBlock(props: { part: ConversationPart }) {
  const toolName = readToolName(props.part);
  const status = readToolStatus(props.part);
  const input = readToolStateField(props.part, "input");
  const output = readToolStateField(props.part, "output");
  const error = readToolStateField(props.part, "error");

  return (
    <section className="rounded-lg border border-border bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-text-secondary">
        <span className="rounded-full border border-border px-2 py-1">Tool call</span>
        <span className="font-medium text-text-primary normal-case">{toolName}</span>
        {status ? <span className="normal-case text-text-secondary">{status}</span> : null}
      </div>

      {input !== undefined ? <ToolLogField label="Input" value={input} /> : null}
      {output !== undefined ? <ToolLogField label="Output" value={output} /> : null}
      {error !== undefined ? <ToolLogField label="Error" value={error} /> : null}

      {input === undefined && output === undefined && error === undefined ? (
        <p className="mt-3 text-sm text-text-secondary">No tool details recorded.</p>
      ) : null}
    </section>
  );
}

function ToolLogField(props: { label: string; value: unknown }) {
  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-text-secondary">{props.label}</p>
      <pre className="mt-1 overflow-auto rounded-md border border-border bg-surface p-3 text-xs leading-6 text-text-primary whitespace-pre-wrap">
        {formatToolLogValue(props.value)}
      </pre>
    </div>
  );
}

function PermissionSummary(props: { profile?: TaskPermissionProfile }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold text-text-primary">Permission summary</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        {props.profile
          ? `Custom tools: ${String(props.profile.customTools?.length ?? 0)}. External MCP: ${String(props.profile.mcpServers?.length ?? 0)}. App MCP: ${String(props.profile.appMcpServers?.length ?? 0)}.`
          : "Inherits the assigned specialist permissions. Each run stores its effective permission snapshot."}
      </p>
    </section>
  );
}

function TextBlock(props: { label?: string; value: string; code?: boolean }) {
  return (
    <section>
      {props.label ? <h2 className="font-semibold text-text-primary">{props.label}</h2> : null}
      {props.code ? (
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-border bg-surface p-3 text-xs text-text-primary whitespace-pre-wrap">
          {props.value}
        </pre>
      ) : (
        <p className="mt-2 text-sm leading-6 text-text-secondary">{props.value}</p>
      )}
    </section>
  );
}

function JsonBlock(props: { label?: string; value: unknown }) {
  if (props.value === undefined) return null;
  return <TextBlock label={props.label} value={JSON.stringify(props.value, null, 2)} code />;
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs uppercase tracking-wide text-text-secondary">{props.label}</p>
      <p className="mt-1 break-words font-medium text-text-primary">{props.value}</p>
    </div>
  );
}

function readBoardStatus(task: Task): string {
  return task.archived ? "archived" : task.status;
}

function readLatestRunResult(runs: TaskRun[]): { content: string; run: TaskRun } | undefined {
  const [latestRun] = runs;
  const content = latestRun
    ? (latestRun.finalMessage ?? latestRun.resultText ?? latestRun.errorMessage)
    : undefined;

  return latestRun && content ? { content, run: latestRun } : undefined;
}

type AggregatedRunArtifact = {
  key: string;
  title: string;
  description?: string;
  link: string;
  href: string;
  external: boolean;
  latestRun: TaskRun;
  runCount: number;
};

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

function hasTaskResultSummary(run: TaskRun): boolean {
  return Boolean(run.finalMessage || run.resultText || run.errorMessage || run.needsHumanReview);
}

function aggregateRunArtifacts(runs: TaskRun[]): AggregatedRunArtifact[] {
  const byKey = new Map<
    string,
    { artifact: TaskRunArtifact; latestRun: TaskRun; runIds: Set<string> }
  >();

  for (const run of runs) {
    for (const artifact of run.artifacts) {
      const key = `${artifact.type}:${artifact.link}`;
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
    link: entry.artifact.link,
    href:
      entry.artifact.type === "file"
        ? buildFileManagerHref({ path: entry.artifact.link, openInEditor: true })
        : entry.artifact.link,
    external: entry.artifact.type !== "file",
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

function readAgentName(agents: Specialist[], agentId: string): string {
  return agents.find((agent) => agent.id === agentId)?.name ?? agentId;
}

function formatTodoProgress(task: Task): string {
  if (task.todos.length === 0) return "0/0";
  const completed = task.todos.filter((todo) => todo.status === "completed").length;
  return `${String(completed)}/${String(task.todos.length)}`;
}

function formatSourceTemplate(task: Task): string {
  if (!task.sourceTemplateId) return "User-created task";
  return task.sourceOccurrenceAt
    ? `Generated ${formatDate(task.sourceOccurrenceAt)}`
    : "Generated from template";
}

function formatSchedule(task: Task): string {
  if (task.scheduledAt) return `Scheduled ${formatDate(task.scheduledAt)}`;
  if (task.scheduledFor) return `Scheduled ${formatDate(task.scheduledFor)}`;
  if (task.dueAt) return `Due ${formatDate(task.dueAt)}`;
  return "Not scheduled";
}

function formatRunTarget(run: TaskRun, subtasks: TaskSubtask[]): string {
  if (!run.subtaskId) return "Parent task";

  const subtask = subtasks.find((entry) => entry.id === run.subtaskId);
  return subtask ? `Subtask: ${subtask.description}` : `Subtask: ${run.subtaskId}`;
}

function formatRunDuration(run: TaskRun): string {
  if (!run.startedAt) return "-";

  const end = run.completedAt ?? run.cancelledAt ?? run.updatedAt;
  const durationMs = Date.parse(end) - Date.parse(run.startedAt);

  if (!Number.isFinite(durationMs) || durationMs < 0) return "-";
  if (durationMs < 1000) return "<1s";

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Request failed.";
}

function readResultMessageCount(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;

  const messageCount = (value as Record<string, unknown>)["messageCount"];
  return typeof messageCount === "number" ? messageCount : undefined;
}

function isToolPart(part: ConversationPart): boolean {
  return part.type === "tool" || part.type === "tool_call";
}

function readToolName(part: ConversationPart): string {
  const value = part["tool"] ?? part["name"];
  return typeof value === "string" && value.trim() ? value : "Tool";
}

function readToolStatus(part: ConversationPart): string | undefined {
  const state = readToolState(part);
  const status = state?.["status"];

  return typeof status === "string" && status.trim() ? status : undefined;
}

function readToolStateField(part: ConversationPart, key: string): unknown {
  return readToolState(part)?.[key];
}

function readToolState(part: ConversationPart): Record<string, unknown> | undefined {
  const state = part["state"];
  return state && typeof state === "object" && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : undefined;
}

function formatToolLogValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}
