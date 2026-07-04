// Board- and subtask-status derivation, split out of task-service.ts (issue #99).

import type {
  TaskRun,
  TaskStatus,
  TaskSubtask,
  TaskSubtaskDerivedStatus,
} from "@cc/shared/schemas";

export function normalizeTaskStatus(input: {
  requestedStatus?: TaskStatus;
  enabled: boolean;
  archived: boolean;
  fallbackStatus?: TaskStatus;
  scheduledAt?: Date | null;
}): TaskStatus {
  if (input.archived) {
    return "archived";
  }

  if (input.requestedStatus === "draft") {
    return "draft";
  }

  if (
    input.requestedStatus &&
    !["archived", "enabled", "disabled"].includes(input.requestedStatus)
  ) {
    return input.requestedStatus;
  }

  if (!input.enabled) {
    return "disabled";
  }

  if (input.scheduledAt) {
    return "scheduled";
  }

  if (input.scheduledAt === null && input.fallbackStatus === "scheduled") {
    return "backlog";
  }

  if (input.fallbackStatus && !["archived", "disabled", "draft"].includes(input.fallbackStatus)) {
    return input.fallbackStatus;
  }

  return "backlog";
}

export function getTaskStatusAfterTerminalRun(run: TaskRun): TaskStatus | undefined {
  // A human-review request always wins: it is an explicit "a human must look"
  // signal and must never be auto-retried, even when the run also errored (e.g. a
  // task run blocked on a permission/question it cannot answer automatically).
  if (run.outcome === "needs_human_review" || run.needsHumanReview) {
    return "review";
  }

  // Otherwise system-defined failures land in `failed` (where they can auto-retry
  // up to a cap), and successful completions are ready for acceptance.
  if (run.status === "failed" || run.status === "error" || run.status === "cancelled") {
    return "failed";
  }

  if (run.status !== "completed") {
    return undefined;
  }

  if (run.outcome === "failed") {
    return "failed";
  }

  return "ready_to_check";
}

export function hasTerminalSubtaskRun(subtaskId: string, runs: TaskRun[]): boolean {
  return runs.some(
    (run) => run.subtaskId === subtaskId && run.status !== "queued" && run.status !== "running",
  );
}

// `runs` is ordered by created_at desc, so the first match is the latest run.
// Only the latest run decides the subtask outcome: a successful fallback retry
// must clear a transient model/provider error from an earlier attempt.

export function latestSubtaskRun(subtaskId: string, runs: TaskRun[]): TaskRun | undefined {
  return runs.find((run) => run.subtaskId === subtaskId);
}

// An intentional human-review hand-off, set only by the specialist or the user
// (or the system when a run blocks on input a human must resolve). This is
// terminal and must never trigger an automatic retry.

export function hasReviewSubtaskRun(subtaskId: string, runs: TaskRun[]): boolean {
  const latest = latestSubtaskRun(subtaskId, runs);
  if (!latest) {
    return false;
  }

  return latest.outcome === "needs_human_review" || latest.needsHumanReview;
}

// A system-defined failure: the run errored, failed, or was cancelled, or the
// agent explicitly reported a `failed` outcome. A human-review hand-off always
// takes precedence, so a run flagged for review is never counted as a failure.

export function hasErroredSubtaskRun(subtaskId: string, runs: TaskRun[]): boolean {
  const latest = latestSubtaskRun(subtaskId, runs);
  if (!latest || hasReviewSubtaskRun(subtaskId, runs)) {
    return false;
  }

  return (
    latest.status === "failed" ||
    latest.status === "error" ||
    latest.status === "cancelled" ||
    latest.outcome === "failed"
  );
}

export function deriveSubtaskStatus(
  subtask: TaskSubtask,
  runs: TaskRun[],
): TaskSubtaskDerivedStatus {
  const latestRun = runs.find((run) => run.subtaskId === subtask.id);

  return latestRun ? deriveRunSubtaskStatus(latestRun) : "backlog";
}

export function deriveRunSubtaskStatus(run: TaskRun): TaskSubtaskDerivedStatus {
  if (run.status === "queued" || run.status === "running") {
    return run.status;
  }

  // A human-review hand-off wins over a failure classification (e.g. a run that
  // errored because it blocked on a permission/question a human must resolve).
  if (run.outcome === "needs_human_review" || run.needsHumanReview) {
    return "review";
  }

  // System-defined failure (errored/failed/cancelled run, or a `failed` outcome).
  if (
    run.status === "failed" ||
    run.status === "error" ||
    run.status === "cancelled" ||
    run.outcome === "failed"
  ) {
    return "failed";
  }

  if (run.status === "completed") {
    return "done";
  }

  return "backlog";
}

export function deriveTaskRunRuntimeState(
  status: string,
  triggerMetadata: Record<string, unknown> | undefined,
): "waiting_for_opencode" | undefined {
  if (status !== "running") {
    return undefined;
  }

  const monitor = triggerMetadata?.["opencodeMonitor"];
  const hasAcceptedPrompt =
    typeof monitor === "object" && monitor !== null && !Array.isArray(monitor);

  return hasAcceptedPrompt ? "waiting_for_opencode" : undefined;
}
