import { describe, expect, it } from "vitest";

import type { TaskRun } from "@cc/shared/schemas";

import { buildTerminalActivity } from "../../src/services/task-activity";

function run(overrides: Partial<TaskRun>): TaskRun {
  return {
    id: "run-1",
    taskId: "task-1",
    agentId: "agent-1",
    status: "completed",
    trigger: { triggerSource: "manual" },
    createdAt: new Date().toISOString(),
    ...overrides,
  } as TaskRun;
}

describe("buildTerminalActivity", () => {
  it("maps a successful plain run to task_completed", () => {
    const activity = buildTerminalActivity({
      run: run({ status: "completed", outcome: "success", resultText: "all done" }),
      taskTitle: "Ship it",
      isFeedbackSubtask: false,
    });
    expect(activity).toMatchObject({
      kind: "task_completed",
      level: "info",
      title: "Task completed: Ship it",
      body: "all done",
      payload: { sourceSpecialistId: "agent-1" },
      dedupeKey: "task_completed:run-1",
    });
  });

  it("separates the readable final message from distinct run output", () => {
    const activity = buildTerminalActivity({
      run: run({
        status: "completed",
        outcome: "success",
        finalMessage: "The report is ready for review.",
        resultText: "outcome: ready_for_review\nreport_path: reports/final.md",
      }),
      taskTitle: "Ship it",
      isFeedbackSubtask: false,
    });

    expect(activity).toMatchObject({
      body: "The report is ready for review.",
      payload: {
        sourceSpecialistId: "agent-1",
        runOutput: "outcome: ready_for_review\nreport_path: reports/final.md",
      },
    });
  });

  it("includes artifacts in task_completed payloads", () => {
    const activity = buildTerminalActivity({
      run: run({
        status: "completed",
        outcome: "success",
        artifacts: [
          {
            id: "art-pr-4",
            conversationId: "conv-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            shareLinks: [],
            documentScope: "global",
            documentOwnerSlug: null,
            title: "PR #4",
            type: "url",
            link: "https://github.com/RedberryProducts/pest-plugin-evals/pull/4",
          },
        ],
      }),
      taskTitle: "Ship it",
      isFeedbackSubtask: false,
    });
    expect(activity?.payload).toMatchObject({
      artifacts: [
        {
          title: "PR #4",
          type: "url",
          link: "https://github.com/RedberryProducts/pest-plugin-evals/pull/4",
        },
      ],
    });
  });

  it("maps a needs-review plain run to task_needs_review with the reason", () => {
    const activity = buildTerminalActivity({
      run: run({
        status: "completed",
        outcome: "needs_human_review",
        humanReviewReason: "please confirm",
      }),
      taskTitle: "Ship it",
      isFeedbackSubtask: false,
    });
    expect(activity).toMatchObject({ kind: "task_needs_review", body: "please confirm" });
  });

  it("includes review questions in task_needs_review payloads", () => {
    const activity = buildTerminalActivity({
      run: run({
        status: "completed",
        outcome: "needs_human_review",
        humanReviewReason: "please confirm",
        reviewQuestion: {
          question: "Should I publish it?",
          suggestedReplies: ["Publish", "Revise"],
        },
      }),
      taskTitle: "Ship it",
      isFeedbackSubtask: false,
    });

    expect(activity?.payload).toMatchObject({
      question: "Should I publish it?",
      suggestedReplies: ["Publish", "Revise"],
    });
  });

  it("includes artifacts in task_needs_review payloads", () => {
    const activity = buildTerminalActivity({
      run: run({
        status: "completed",
        outcome: "needs_human_review",
        artifacts: [
          {
            id: "art-review",
            conversationId: "conv-1",
            createdAt: "2026-01-01T00:00:00.000Z",
            shareLinks: [],
            documentScope: "global",
            documentOwnerSlug: null,
            title: "Review report",
            type: "file",
            link: "reports/review.md",
          },
        ],
      }),
      taskTitle: "Ship it",
      isFeedbackSubtask: false,
    });
    expect(activity?.payload).toMatchObject({
      artifacts: [
        {
          title: "Review report",
          type: "file",
          link: "reports/review.md",
        },
      ],
    });
  });

  it("maps a failed run to task_run_failed regardless of subtask", () => {
    const activity = buildTerminalActivity({
      run: run({ status: "failed", subtaskId: "s1", errorMessage: "boom" }),
      taskTitle: "Ship it",
      isFeedbackSubtask: true,
    });
    expect(activity).toMatchObject({
      kind: "task_run_failed",
      body: "boom",
      payload: { taskId: "task-1", taskRunId: "run-1", subtaskId: "s1" },
    });
  });

  it("maps a feedback subtask success to feedback_resolved (info)", () => {
    const activity = buildTerminalActivity({
      run: run({ status: "completed", outcome: "success", subtaskId: "s1" }),
      taskTitle: "Ship it",
      isFeedbackSubtask: true,
    });
    expect(activity).toMatchObject({ kind: "feedback_resolved", level: "info" });
  });

  it("maps a feedback subtask needs-review to subtask_needs_review", () => {
    const activity = buildTerminalActivity({
      run: run({ status: "completed", outcome: "needs_human_review", subtaskId: "s1" }),
      taskTitle: "Ship it",
      isFeedbackSubtask: true,
    });
    expect(activity).toMatchObject({ kind: "subtask_needs_review", level: "action_required" });
  });

  it("includes review questions in subtask_needs_review payloads", () => {
    const activity = buildTerminalActivity({
      run: run({
        status: "completed",
        outcome: "needs_human_review",
        subtaskId: "s1",
        reviewQuestion: {
          question: "Which fix should I try?",
          suggestedReplies: ["Small patch", "Full rewrite"],
        },
      }),
      taskTitle: "Ship it",
      isFeedbackSubtask: true,
    });

    expect(activity?.payload).toMatchObject({
      taskId: "task-1",
      taskRunId: "run-1",
      subtaskId: "s1",
      question: "Which fix should I try?",
      suggestedReplies: ["Small patch", "Full rewrite"],
    });
  });

  it("emits nothing for a fresh (non-feedback) subtask success or review", () => {
    expect(
      buildTerminalActivity({
        run: run({ status: "completed", outcome: "success", subtaskId: "s1" }),
        taskTitle: "Ship it",
        isFeedbackSubtask: false,
      }),
    ).toBeNull();
    expect(
      buildTerminalActivity({
        run: run({ status: "completed", outcome: "needs_human_review", subtaskId: "s1" }),
        taskTitle: "Ship it",
        isFeedbackSubtask: false,
      }),
    ).toBeNull();
  });

  it("emits nothing for a manually cancelled (no errorDetails) or skipped run", () => {
    expect(
      buildTerminalActivity({
        run: run({ status: "cancelled" }),
        taskTitle: "Ship it",
        isFeedbackSubtask: false,
      }),
    ).toBeNull();
    expect(
      buildTerminalActivity({
        run: run({ status: "skipped" }),
        taskTitle: "Ship it",
        isFeedbackSubtask: false,
      }),
    ).toBeNull();
  });

  it("maps a system-cancelled run (e.g. stall timeout) to task_run_failed", () => {
    // errorMessage mirrors cancellationReason for a stall cancellation (set by
    // finalizeStalledRun), so the notification body isn't left empty.
    const activity = buildTerminalActivity({
      run: run({
        status: "cancelled",
        cancellationReason: "Automatically cancelled: OpenCode produced no new output...",
        errorDetails: { errorName: "TaskRunStallTimeout", stage: "monitor_stall" },
        errorMessage: "Automatically cancelled: OpenCode produced no new output...",
      }),
      taskTitle: "Ship it",
      isFeedbackSubtask: false,
    });
    expect(activity).toMatchObject({
      kind: "task_run_failed",
      level: "action_required",
      title: "Task run failed: Ship it",
      body: "Automatically cancelled: OpenCode produced no new output...",
      dedupeKey: "task_run_failed:run-1",
    });
  });

  it("labels a hard usage-limit failure (no fallback) as action_required", () => {
    const activity = buildTerminalActivity({
      run: run({
        status: "error",
        errorMessage: "The usage limit has been reached.",
        errorDetails: { errorName: "UsageLimitReached", fallbackQueued: false },
      }),
      taskTitle: "Ship it",
      isFeedbackSubtask: false,
    });
    expect(activity).toMatchObject({
      kind: "task_run_failed",
      level: "action_required",
      title: "Usage limit reached: Ship it",
      body: "The usage limit has been reached.",
    });
  });

  it("labels a usage-limit failure with a queued fallback as info", () => {
    const activity = buildTerminalActivity({
      run: run({
        status: "error",
        errorMessage:
          "The usage limit has been reached. Retrying with fallback model anthropic/claude-haiku.",
        errorDetails: {
          errorName: "UsageLimitReached",
          fallbackQueued: true,
          fallbackModel: "anthropic/claude-haiku",
        },
      }),
      taskTitle: "Ship it",
      isFeedbackSubtask: false,
    });
    expect(activity).toMatchObject({
      kind: "task_run_failed",
      level: "info",
      title: "Usage limit reached, retrying with anthropic/claude-haiku: Ship it",
    });
  });
});
