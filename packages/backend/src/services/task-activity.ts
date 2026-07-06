import type { ActivityKind, ActivityLevel } from "@cc/shared/schemas";
import type { TaskRun } from "@cc/shared/schemas";

export type TerminalActivityInput = {
  kind: ActivityKind;
  level: ActivityLevel;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  dedupeKey: string;
};

type TerminalRun = Pick<
  TaskRun,
  | "id"
  | "taskId"
  | "subtaskId"
  | "status"
  | "outcome"
  | "resultText"
  | "finalMessage"
  | "errorMessage"
  | "errorDetails"
  | "needsHumanReview"
  | "humanReviewReason"
  | "reviewQuestion"
  | "artifacts"
>;

/**
 * Map a just-finished task run to the activity it should produce, or `null` when
 * it produces none. Pure so the branching is unit-testable without a DB.
 *
 * Branching:
 * - any failed/error run, or a system-cancelled run (e.g. the stall timeout,
 *   which carries `errorDetails`)   → `task_run_failed` (action_required)
 * - ...a usage limit with no fallback available → `task_run_failed` (action_required)
 * - ...a usage limit that queued a different-provider fallback → `task_run_failed` (info)
 * - success, no subtask             → `task_completed`
 * - success, feedback subtask       → `feedback_resolved`
 * - needs review, no subtask        → `task_needs_review`
 * - needs review, feedback subtask  → `subtask_needs_review`
 * - fresh (non-feedback) subtask success/review → none (rolls up into the parent)
 * - a manually cancelled run (no `errorDetails`) / skipped → none
 */
export function buildTerminalActivity(args: {
  run: TerminalRun;
  taskTitle: string;
  isFeedbackSubtask: boolean;
}): TerminalActivityInput | null {
  const { run, taskTitle, isFeedbackSubtask } = args;

  if (run.status === "skipped") {
    return null;
  }

  // A manual cancel (via the `cancel` API) carries no errorDetails and is the
  // user's own action, so it stays silent. A system-initiated cancel (e.g. the
  // stall timeout) carries errorDetails and is surfaced like any other failure.
  const systemCancelled = run.status === "cancelled" && run.errorDetails !== undefined;

  if (run.status === "cancelled" && !systemCancelled) {
    return null;
  }

  const failed =
    systemCancelled ||
    run.status === "failed" ||
    run.status === "error" ||
    run.outcome === "failed";
  const needsReview =
    !failed && (run.outcome === "needs_human_review" || run.needsHumanReview === true);
  const success =
    !failed && !needsReview && (run.status === "completed" || run.outcome === "success");

  const basePayload: Record<string, unknown> = {
    taskId: run.taskId,
    taskRunId: run.id,
    ...(run.subtaskId ? { subtaskId: run.subtaskId } : {}),
  };
  const outcomePayload: Record<string, unknown> = {
    ...basePayload,
    ...((run.artifacts?.length ?? 0) > 0 ? { artifacts: run.artifacts } : {}),
  };
  const reviewQuestionPayload: Record<string, unknown> = run.reviewQuestion
    ? {
        question: run.reviewQuestion.question,
        suggestedReplies: run.reviewQuestion.suggestedReplies,
      }
    : {};

  if (failed) {
    const usageLimit = readUsageLimitFailure(run.errorDetails);

    if (usageLimit?.fallbackModel) {
      return {
        kind: "task_run_failed",
        level: "info",
        title: `Usage limit reached, retrying with ${usageLimit.fallbackModel}: ${taskTitle}`,
        body: run.errorMessage ?? run.finalMessage ?? null,
        payload: basePayload,
        dedupeKey: `task_run_failed:${run.id}`,
      };
    }

    if (usageLimit) {
      return {
        kind: "task_run_failed",
        level: "action_required",
        title: `Usage limit reached: ${taskTitle}`,
        body: run.errorMessage ?? run.finalMessage ?? null,
        payload: basePayload,
        dedupeKey: `task_run_failed:${run.id}`,
      };
    }

    return {
      kind: "task_run_failed",
      level: "action_required",
      title: `Task run failed: ${taskTitle}`,
      body: run.errorMessage ?? run.finalMessage ?? null,
      payload: basePayload,
      dedupeKey: `task_run_failed:${run.id}`,
    };
  }

  if (success) {
    if (!run.subtaskId) {
      return {
        kind: "task_completed",
        level: "action_required",
        title: `Task completed: ${taskTitle}`,
        body: run.resultText ?? run.finalMessage ?? null,
        payload: outcomePayload,
        dedupeKey: `task_completed:${run.id}`,
      };
    }
    if (isFeedbackSubtask) {
      return {
        kind: "feedback_resolved",
        level: "info",
        title: `Feedback resolved: ${taskTitle}`,
        body: run.resultText ?? run.finalMessage ?? null,
        payload: basePayload,
        dedupeKey: `feedback_resolved:${run.id}`,
      };
    }
    return null;
  }

  if (needsReview) {
    if (!run.subtaskId) {
      return {
        kind: "task_needs_review",
        level: "action_required",
        title: `Task needs review: ${taskTitle}`,
        body: run.humanReviewReason ?? run.resultText ?? run.finalMessage ?? null,
        payload: { ...outcomePayload, ...reviewQuestionPayload },
        dedupeKey: `task_needs_review:${run.id}`,
      };
    }
    if (isFeedbackSubtask) {
      return {
        kind: "subtask_needs_review",
        level: "action_required",
        title: `Feedback needs review: ${taskTitle}`,
        body: run.humanReviewReason ?? run.resultText ?? run.finalMessage ?? null,
        payload: { ...basePayload, ...reviewQuestionPayload },
        dedupeKey: `subtask_needs_review:${run.id}`,
      };
    }
    return null;
  }

  return null;
}

function readUsageLimitFailure(
  errorDetails: Record<string, unknown> | undefined,
): { fallbackModel?: string } | undefined {
  if (!errorDetails || errorDetails["errorName"] !== "UsageLimitReached") {
    return undefined;
  }

  const fallbackModel = errorDetails["fallbackModel"];
  return { fallbackModel: typeof fallbackModel === "string" ? fallbackModel : undefined };
}
