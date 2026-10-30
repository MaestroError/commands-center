import { Link } from "react-router";
import { useTaskMutations, useTaskRunFollowupsQuery } from "@/hooks/use-tasks-query";
import { Button } from "@/components/ui/button";

export function TaskRunReplyQueue({ taskId, runId }: { taskId: string; runId: string }) {
  const query = useTaskRunFollowupsQuery(taskId, runId);
  const mutations = useTaskMutations();
  const pending = (query.data ?? []).filter((reply) =>
    ["queued", "delivering", "sending", "blocked"].includes(reply.status),
  );
  if (pending.length === 0) return null;
  return (
    <details
      open
      className="rounded-lg border border-border bg-surface p-3"
      data-testid="task-run-reply-queue"
    >
      <summary>Pending messages ({pending.length})</summary>
      <p className="text-sm text-text-secondary">Task run {runId}</p>
      <ol className="grid gap-2">
        {pending.map((reply) => (
          <li key={reply.id} className="rounded-md border border-border p-2">
            <p className="whitespace-pre-wrap">{reply.body}</p>
            <p className="text-sm text-text-secondary">
              {reply.kind === "team_result"
                ? "CC team result"
                : reply.kind === "team_revision"
                  ? "Owner revision request"
                  : reply.kind === "review_answer"
                    ? "Review answer"
                    : "Operator reply"}{" "}
              · {reply.status === "sending" ? "Delivered — awaiting answer" : reply.status}
            </p>
            {reply.waitingReason && (
              <p className="text-sm text-text-secondary">{reply.waitingReason}</p>
            )}
            {(reply.status === "queued" ||
              (reply.status === "blocked" && !reply.deliveryStartedAt)) &&
              !reply.kind.startsWith("team_") && (
                <Button
                  variant="secondary"
                  disabled={mutations.cancelRunFollowup.isPending}
                  onClick={() =>
                    mutations.cancelRunFollowup.mutate({ taskId, runId, id: reply.id })
                  }
                >
                  Cancel queued reply
                </Button>
              )}
            {reply.status === "blocked" && reply.deliveryStartedAt && (
              <div className="grid gap-2 text-sm text-danger">
                <Link to={`/tasks/${taskId}/runs/${runId}`} className="underline">
                  Inspect this run's session
                </Link>
                , then cancel the run before retrying if delivery remains uncertain.
                <Button
                  variant="secondary"
                  disabled={mutations.cancelRun.isPending}
                  onClick={() => mutations.cancelRun.mutate({ taskId, runId })}
                >
                  Cancel blocked run
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {(mutations.cancelRunFollowup.error ?? mutations.cancelRun.error) && (
        <p role="alert">
          {(mutations.cancelRunFollowup.error ?? mutations.cancelRun.error)?.message}
        </p>
      )}
    </details>
  );
}
