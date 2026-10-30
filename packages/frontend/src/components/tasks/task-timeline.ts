import type { TaskRun, TaskRunFollowup, TaskSubtask } from "@cc/shared/schemas";

export type TaskTimelineEntry = {
  id: string;
  at: string;
  title: string;
  body: string;
  agentId?: string;
  run?: TaskRun;
  reply?: TaskRunFollowup;
  statusLabel?: string;
  assignment?: TaskSubtask;
};

export function buildTaskTimeline(
  runs: TaskRun[],
  replies: TaskRunFollowup[],
  assignments: TaskSubtask[],
): TaskTimelineEntry[] {
  const entries: TaskTimelineEntry[] = [];
  for (const assignment of assignments.filter((child) => child.ownerRunId)) {
    const run = runs.find((run) => run.subtaskId === assignment.id);
    entries.push({
      id: `assignment:${assignment.id}`,
      at: assignment.createdAt,
      title: "Assignment delegated",
      body: `${assignment.description}\n\nExpected output: ${assignment.expectedOutput ?? "See assignment brief."}`,
      agentId: assignment.agentId,
      assignment,
      run,
    });
    if (
      assignment.acceptedAt &&
      !replies.some(
        (reply) =>
          reply.kind === "lifecycle" &&
          reply.body.startsWith(`Owner accepted assignment ${assignment.id}:`),
      )
    )
      entries.push({
        id: `accepted:${assignment.id}`,
        at: assignment.acceptedAt,
        title: "Assignment accepted by owner",
        body: assignment.description,
        agentId: assignment.agentId,
        run,
      });
  }
  for (const run of runs) {
    if (!run.subtaskId)
      entries.push({
        id: `execution:${run.id}`,
        at: run.createdAt,
        title: "Owner execution created",
        body: "All replies continue this execution. Duplicate the task for a fresh attempt.",
        agentId: run.agentId,
        run,
      });
    const body = run.initialOutcomeText ?? run.resultText ?? run.finalMessage;
    if (body)
      entries.push({
        id: `outcome:${run.id}`,
        at: run.initialOutcomeAt ?? run.completedAt ?? run.updatedAt,
        title: run.subtaskId ? "Assignment result" : "Owner response",
        body,
        agentId: run.agentId,
        run,
      });
    if (
      ["cancelled", "error", "failed", "skipped"].includes(run.status) &&
      !replies.some((reply) => reply.kind === "lifecycle" && reply.runId === run.id)
    )
      entries.push({
        id: `stopped:${run.id}`,
        at: run.cancelledAt ?? run.completedAt ?? run.updatedAt,
        title: run.subtaskId ? "Assignment stopped" : "Execution stopped",
        body: run.cancellationReason ?? run.errorMessage ?? `Execution ${run.status}.`,
        agentId: run.agentId,
        run,
      });
  }
  for (const reply of replies) {
    const run = runs.find((run) => run.id === reply.runId);
    const title =
      reply.kind === "team_result"
        ? "Assignment result notification"
        : reply.kind === "team_revision"
          ? "Owner requested a revision"
          : reply.kind === "recovery"
            ? "Continuing with fallback model"
            : reply.kind === "lifecycle"
              ? "Execution event"
              : "You replied";
    entries.push({
      id: `reply:${reply.id}`,
      at: reply.createdAt,
      title,
      body: reply.kind === "team_result" ? teamResultMessages[reply.status] : reply.body,
      statusLabel:
        reply.kind === "team_result"
          ? reply.status === "handled"
            ? "already_handled"
            : reply.status === "sending"
              ? "delivered"
              : reply.status
          : reply.status,
      reply,
      run,
    });
    if (reply.answerBody)
      entries.push({
        id: `answer:${reply.id}`,
        at: reply.answeredAt ?? reply.createdAt,
        title: run?.subtaskId ? "Assignment response" : "Owner response",
        body: reply.answerBody,
        agentId: run?.agentId,
        run,
      });
  }
  return entries.sort(
    (left, right) => Date.parse(left.at) - Date.parse(right.at) || left.id.localeCompare(right.id),
  );
}

const teamResultMessages: Record<TaskRunFollowup["status"], string> = {
  queued: "The worker's result is queued for the owner's next available turn.",
  delivering: "CC is delivering the worker's result to the owner session.",
  sending: "The worker's result was delivered to the owner session; awaiting its response.",
  answered: "The owner responded to the delivered worker result.",
  handled:
    "The owner already accepted this assignment through its tools. No extra notification was delivered.",
  cancelled: "This result notification was cancelled.",
  blocked: "Result delivery needs attention. Inspect the delivery details before retrying.",
  failed: "The result notification did not receive a successful owner response.",
};
