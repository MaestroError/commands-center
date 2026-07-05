// Pure subtask/status helpers split out of task-execution-service.ts (issue #99).

import type { QueueTaskInput, TaskRun } from "@cc/shared/schemas";

export function readScheduledAtFromTrigger(trigger: QueueTaskInput): string | undefined {
  const scheduledAt = trigger.metadata?.["scheduledAt"];
  return typeof scheduledAt === "string" ? scheduledAt : undefined;
}

// NOTE: `hasTerminalSubtaskRun` / `latestSubtaskRun` are duplicated verbatim in
// `task-service/status.ts`. Both god-files already carried their own copies; this
// split preserves that (a pure move). Consolidation into `@cc/shared` is
// deliberately deferred — see issue #95.
export function hasTerminalSubtaskRun(subtaskId: string, runs: TaskRun[]): boolean {
  return runs.some(
    (run) => run.subtaskId === subtaskId && run.status !== "queued" && run.status !== "running",
  );
}

// `runs` is ordered created_at desc, so the first match is the subtask's latest
// run. Retry eligibility is decided by the latest run only, so a successful retry
// clears an earlier transient failure.

export function latestSubtaskRun(subtaskId: string, runs: TaskRun[]): TaskRun | undefined {
  return runs.find((run) => run.subtaskId === subtaskId);
}

// Latest run is an intentional human-review hand-off. Terminal: never auto-retried.

export function latestSubtaskRunNeedsReview(subtaskId: string, runs: TaskRun[]): boolean {
  const latest = latestSubtaskRun(subtaskId, runs);
  if (!latest) {
    return false;
  }

  return latest.outcome === "needs_human_review" || latest.needsHumanReview;
}

// Latest run is a system-defined failure (errored/failed/cancelled, or a `failed`
// outcome). Eligible for bounded automatic retry. A human-review hand-off wins, so
// a run flagged for review (e.g. blocked on input) is never treated as retryable.

export function latestSubtaskRunErrored(subtaskId: string, runs: TaskRun[]): boolean {
  const latest = latestSubtaskRun(subtaskId, runs);
  if (!latest || latestSubtaskRunNeedsReview(subtaskId, runs)) {
    return false;
  }

  return (
    latest.status === "failed" ||
    latest.status === "error" ||
    latest.status === "cancelled" ||
    latest.outcome === "failed"
  );
}
