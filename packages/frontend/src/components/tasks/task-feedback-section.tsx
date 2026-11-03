import { useState } from "react";
import { TaskRunReplyQueue } from "./TaskRunReplyQueue";
import { FeedbackComment } from "./TaskTimelineComment";

import type { Specialist, TaskRun, TaskRunFollowup } from "@cc/shared/schemas";

import { formatDate } from "@/components/tasks/task-format";
import { StatusBadge } from "@/components/tasks/task-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTaskMutations, useTaskRunFollowupsQuery } from "@/hooks/use-tasks-query";

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Request failed.";
}

export { TaskTimeline as TaskFeedbackPanelSection } from "./TaskTimeline";

export function RunReplyPanel(props: { taskId: string; run: TaskRun; agent?: Specialist }) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [body, setBody] = useState("");
  const [request, setRequest] = useState<{ body: string; id: string }>();
  const [error, setError] = useState<string>();
  const canReply = !["cancelled", "skipped"].includes(props.run.status);
  const followupsQuery = useTaskRunFollowupsQuery(props.taskId, props.run.id);
  const mutations = useTaskMutations();

  async function submit(): Promise<void> {
    const trimmedBody = body.trim();

    if (!canReply || !trimmedBody) return;

    setError(undefined);
    const requestId = request?.body === trimmedBody ? request.id : crypto.randomUUID();
    setRequest({ body: trimmedBody, id: requestId });

    try {
      await mutations.createRunFollowup.mutateAsync({
        taskId: props.taskId,
        runId: props.run.id,
        input: { body: trimmedBody, requestId },
      });

      setBody("");
      setRequest(undefined);
      setIsComposerOpen(false);
    } catch (submitError) {
      setError(readError(submitError));
    }
  }

  const followups = followupsQuery.data ?? [];
  const isSending = mutations.createRunFollowup.isPending;
  const disabledReason = !canReply
    ? "Cancelled or skipped runs cannot receive replies."
    : undefined;

  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-border bg-surface p-3">
      <TaskRunReplyQueue taskId={props.taskId} runId={props.run.id} />
      {followupsQuery.isLoading ? (
        <p className="text-xs text-text-secondary">Loading replies...</p>
      ) : null}
      {followups.length > 0 ? (
        <div aria-label="Replies" className="grid gap-3">
          {followups
            .filter(
              (followup) =>
                !["queued", "delivering", "sending", "blocked"].includes(followup.status),
            )
            .map((followup) => (
              <RunFollowupThreadItem agent={props.agent} followup={followup} key={followup.id} />
            ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text-primary">Reply to this run</p>
          <p className="text-xs text-text-secondary">
            Replies are queued for this run and delivered when the specialist is available.
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
        author={
          props.followup.kind === "lifecycle"
            ? "Execution event"
            : props.followup.kind === "recovery"
              ? "Model fallback"
              : props.followup.kind.startsWith("team_")
                ? "Team update"
                : "You replied"
        }
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
