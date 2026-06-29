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
      level: "action_required",
      title: "Task completed: Ship it",
      body: "all done",
      dedupeKey: "task_completed:run-1",
    });
  });

  it("includes artifacts in task_completed payloads", () => {
    const activity = buildTerminalActivity({
      run: run({
        status: "completed",
        outcome: "success",
        artifacts: [
          {
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

  it("includes artifacts in task_needs_review payloads", () => {
    const activity = buildTerminalActivity({
      run: run({
        status: "completed",
        outcome: "needs_human_review",
        artifacts: [
          {
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

  it("emits nothing for cancelled or skipped runs", () => {
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
});
