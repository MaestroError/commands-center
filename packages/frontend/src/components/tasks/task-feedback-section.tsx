import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";

import type {
  Artifact,
  CreateTaskFeedbackInput,
  Specialist,
  SpecialistCatalog,
  Task,
  TaskFeedbackThread,
  TaskRun,
  TaskRunFollowup,
} from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { Markdown } from "@/components/chat/Markdown";
import { ArtifactShareControls } from "@/components/tasks/ArtifactShareControls";
import { TaskPromptComposer } from "@/components/tasks/TaskPromptComposer";
import { buildArtifactHref, formatDate, readAgentName } from "@/components/tasks/task-format";
import {
  buildTaskPromptText,
  createTaskPromptValue,
  type TaskPromptValue,
} from "@/components/tasks/task-prompt";
import { StatusBadge } from "@/components/tasks/task-ui";
import { SpecialistAvatar } from "@/components/specialists/specialist-avatar";
import { useSpecialistCatalogQuery } from "@/hooks/use-specialists-query";
import {
  useTaskFeedbackQuery,
  useTaskMutations,
  useTaskRunFollowupsQuery,
} from "@/hooks/use-tasks-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Request failed.";
}

export function TaskFeedbackPanelSection(props: {
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
              enableSpecialistMentions
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
                        <Textarea
                          aria-label="Edit feedback"
                          className="min-h-24"
                          onChange={(event) => setEditingFeedbackBody(event.target.value)}
                          value={editingFeedbackBody}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={props.isUpdatingFeedback || !editingFeedbackBody.trim()}
                            onClick={() => void updateFeedback(entry.id)}
                            type="button"
                          >
                            Save
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={props.isUpdatingFeedback}
                            onClick={() => {
                              setEditingFeedbackId(undefined);
                              setEditingFeedbackBody("");
                            }}
                            type="button"
                          >
                            Cancel
                          </Button>
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
                    <span>{formatDate(readRunCommentAt(run))}</span>
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
                <RunReplyPanel agent={agent} run={run} taskId={props.task.id} />
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
      <Button
        variant="secondary"
        data-testid={props.sendTestId}
        disabled={props.disabled || isBusy}
        onClick={props.onSend}
        type="button"
      >
        {props.isSending ? "Sending..." : "Send"}
      </Button>
      <Button
        data-testid={props.requeueTestId}
        disabled={props.disabled || isBusy}
        onClick={props.onSendAndRequeue}
        type="button"
      >
        {props.isRequeueing ? "Sending..." : "Send & requeue"}
      </Button>
    </div>
  );
}

export function RunReplyPanel(props: { taskId: string; run: TaskRun; agent?: Specialist }) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string>();
  const isRunning = props.run.status === "running";
  const canReply = Boolean(props.run.opencodeSessionId) && !isRunning;
  const followupsQuery = useTaskRunFollowupsQuery(props.taskId, props.run.id);
  const mutations = useTaskMutations();

  async function submit(): Promise<void> {
    const trimmedBody = body.trim();

    if (!canReply || !trimmedBody) return;

    setError(undefined);

    try {
      await mutations.createRunFollowup.mutateAsync({
        taskId: props.taskId,
        runId: props.run.id,
        input: { body: trimmedBody },
      });

      setBody("");
      setIsComposerOpen(false);
    } catch (submitError) {
      setError(readError(submitError));
    }
  }

  const followups = followupsQuery.data ?? [];
  const isSending = mutations.createRunFollowup.isPending;
  const disabledReason = isRunning
    ? "Replies are disabled while the run is in progress."
    : !props.run.opencodeSessionId
      ? "Replies require a recorded OpenCode session."
      : undefined;

  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-border bg-surface p-3">
      {followupsQuery.isLoading ? (
        <p className="text-xs text-text-secondary">Loading replies...</p>
      ) : null}
      {followups.length > 0 ? (
        <div aria-label="Replies" className="grid gap-3">
          {followups.map((followup) => (
            <RunFollowupThreadItem agent={props.agent} followup={followup} key={followup.id} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text-primary">Reply to this run</p>
          <p className="text-xs text-text-secondary">
            Replies are sent immediately into this run&apos;s existing session.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={!canReply}
          onClick={() => setIsComposerOpen((current) => !current)}
          title={disabledReason}
          type="button"
        >
          Reply
        </Button>
      </div>

      {disabledReason ? (
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text-secondary">
          {disabledReason}
        </p>
      ) : null}

      {isComposerOpen ? (
        <div className="grid gap-2">
          <Textarea
            aria-label={`Reply to run ${props.run.id}`}
            className="min-h-24"
            disabled={!canReply}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add a short follow-up for the specialist."
            value={body}
          />
          <Button
            className="w-fit"
            data-testid={`task-run-reply-send-${props.run.id}`}
            disabled={!canReply || !body.trim() || isSending}
            onClick={() => void submit()}
            type="button"
          >
            {isSending ? "Sending..." : "Reply"}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RunFollowupThreadItem(props: { followup: TaskRunFollowup; agent?: Specialist }) {
  return (
    <div className="grid gap-2">
      <FeedbackComment
        author="You replied"
        body={props.followup.body}
        meta={<StatusBadge status={props.followup.status} />}
        tone="operator"
      />
      {props.followup.answerBody ? (
        <div className="ml-6 border-l border-border pl-4">
          <FeedbackComment
            agent={props.agent}
            author={`${props.agent?.name ?? "Specialist"} replied`}
            body={props.followup.answerBody}
            meta={<span>{formatDate(props.followup.answeredAt)}</span>}
            tone="agent"
          />
        </div>
      ) : props.followup.status === "sending" ? (
        <p className="ml-6 border-l border-border pl-4 text-xs text-text-secondary">
          Waiting for a response…
        </p>
      ) : props.followup.status === "failed" ? (
        <p className="ml-6 border-l border-danger/30 pl-4 text-xs text-danger">
          {props.followup.errorMessage ?? "Reply failed to deliver."}
        </p>
      ) : null}
    </div>
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
  artifacts?: Artifact[];
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

function RunArtifactAttachments(props: { artifacts: Artifact[]; taskId?: string; runId?: string }) {
  if (props.artifacts.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 grid gap-2" aria-label="Run artifacts">
      {props.artifacts.map((artifact) => {
        const href = buildArtifactHref(artifact);
        return (
          <li
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary"
            key={artifact.id}
          >
            <span className="min-w-0">
              <a
                className="break-words font-medium text-accent underline-offset-4 hover:underline [overflow-wrap:anywhere]"
                href={href}
                rel="noreferrer"
                target={artifact.type === "url" ? "_blank" : undefined}
              >
                {artifact.title}
              </a>
              <span className="block text-xs text-text-muted [overflow-wrap:anywhere]">
                {artifact.link}
              </span>
              <span className="mt-2 block text-xs text-text-secondary">
                {artifact.description ?? artifact.title}
              </span>
              {props.taskId ? (
                <ArtifactShareControls artifact={artifact} taskId={props.taskId} />
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
                <span>{formatDate(readRunCommentAt(reply.run))}</span>
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

function hasRunOutcomeSummary(run: TaskRun): boolean {
  // Mirror the fields readRunCommentBody renders (frozen text included), so a
  // run whose live final/result/error fields are cleared but that has a frozen
  // outcome still shows its comment entry.
  return Boolean(
    !run.subtaskId &&
    (run.initialOutcomeText || run.finalMessage || run.resultText || run.errorMessage),
  );
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
      timestamp: readRunCommentAt(run),
      run,
    })),
  ].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
}

function readRunCommentBody(run: TaskRun): string {
  return (
    run.initialOutcomeText ??
    run.resultText ??
    run.finalMessage ??
    run.errorMessage ??
    "No result yet."
  );
}

function readRunCommentAt(run: TaskRun): string {
  return run.initialOutcomeAt ?? run.completedAt ?? run.updatedAt;
}
