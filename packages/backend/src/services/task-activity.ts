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
 * - any failed/error run            → `task_run_failed`
 * - success, no subtask             → `task_completed`
 * - success, feedback subtask       → `feedback_resolved`
 * - needs review, no subtask        → `task_needs_review`
 * - needs review, feedback subtask  → `subtask_needs_review`
 * - fresh (non-feedback) subtask success/review → none (rolls up into the parent)
 * - cancelled / skipped             → none
 */
export function buildTerminalActivity(args: {
  run: TerminalRun;
  taskTitle: string;
  isFeedbackSubtask: boolean;
}): TerminalActivityInput | null {
  const { run, taskTitle, isFeedbackSubtask } = args;

  if (run.status === "cancelled" || run.status === "skipped") {
    return null;
  }

  const failed = run.status === "failed" || run.status === "error" || run.outcome === "failed";
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
