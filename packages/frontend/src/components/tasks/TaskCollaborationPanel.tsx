import { Link } from "react-router";
import type { Specialist, TaskRun } from "@cc/shared/schemas";
import { useTaskMutations, useTaskSubtasksQuery } from "@/hooks/use-tasks-query";
import { TaskRunReplyQueue } from "./TaskRunReplyQueue";
import { StatusBadge } from "./task-ui";
import { buildArtifactHref } from "./task-format";
import { Button } from "@/components/ui/button";

export function TaskCollaborationPanel({
  taskId,
  runs,
  agents,
}: {
  taskId: string;
  runs: TaskRun[];
  agents: Specialist[];
}) {
  const subtasks = useTaskSubtasksQuery(taskId);
  const mutations = useTaskMutations();
  const assignments = (subtasks.data ?? []).filter((child) => child.ownerRunId);
  const roots = runs.filter((run) => !run.subtaskId);
  return (
    <section
      aria-label="Task collaboration"
      className="grid gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <h2>Execution and queued replies</h2>
      {roots.map((root) => (
        <details open={root.id === roots[0]?.id} key={root.id}>
          <summary>
            {agents.find((agent) => agent.id === root.agentId)?.name ?? root.agentId} ·{" "}
            <StatusBadge status={root.status} /> · {root.id}
          </summary>
          {root.status === "waiting" && (
            <p>Waiting for assignment results or owner acceptance. Replies can still be queued.</p>
          )}
          {assignments.some((child) => child.ownerRunId === root.id) &&
            ["running", "queued", "waiting"].includes(root.status) && (
              <Button
                variant="secondary"
                disabled={mutations.cancelRun.isPending}
                onClick={() => mutations.cancelRun.mutate({ taskId, runId: root.id })}
              >
                Cancel goal
              </Button>
            )}
          <TaskRunReplyQueue taskId={taskId} runId={root.id} />
          {assignments
            .filter((child) => child.ownerRunId === root.id)
            .map((child) => {
              const run = runs.find((run) => run.subtaskId === child.id);
              return (
                <article
                  key={child.id}
                  className="my-3 grid gap-2 rounded-md border border-border p-3"
                >
                  <h3>
                    {agents.find((agent) => agent.id === child.agentId)?.name ?? child.agentId}
                  </h3>
                  <p className="whitespace-pre-wrap">{child.description}</p>
                  <p>Expected output: {child.expectedOutput}</p>
                  <p>
                    {child.acceptedAt ? "Accepted by owner" : "Awaiting owner acceptance"} ·
                    Revisions: {child.revisionCount ?? 0}
                  </p>
                  {run ? (
                    <>
                      <StatusBadge status={run.status} />
                      <Link
                        className="text-accent underline"
                        to={`/tasks/${taskId}/runs/${run.id}`}
                      >
                        Open assignment session
                      </Link>
                      <p className="whitespace-pre-wrap">
                        {run.resultText ?? run.finalMessage ?? run.errorMessage}
                      </p>
                      {run.artifacts.map((artifact) => (
                        <a
                          className="text-accent underline"
                          key={artifact.id}
                          href={buildArtifactHref(artifact)}
                        >
                          {artifact.title}
                        </a>
                      ))}
                      <TaskRunReplyQueue taskId={taskId} runId={run.id} />
                      {["running", "queued", "waiting"].includes(run.status) && (
                        <Button
                          variant="secondary"
                          onClick={() => mutations.cancelRun.mutate({ taskId, runId: run.id })}
                        >
                          Cancel assignment
                        </Button>
                      )}
                    </>
                  ) : (
                    <p>Assignment recorded; preparing worker execution.</p>
                  )}
                </article>
              );
            })}
        </details>
      ))}
      {mutations.cancelRun.error && <p role="alert">{mutations.cancelRun.error.message}</p>}
    </section>
  );
}
