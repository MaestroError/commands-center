import type { TaskRun } from "@cc/shared/schemas";
import { describe, expect, it } from "vitest";

import { readLatestRunResult as readPanelResult } from "../tasks/task-helpers";
import { readLatestRunResult as readPageResult } from "./task-detail-helpers";

const owner: TaskRun = {
  id: "owner-run",
  taskId: "task-1",
  agentId: "owner",
  fallbackModels: [],
  status: "completed",
  triggerSource: "manual",
  renderedPrompt: "Coordinate the task.",
  finalMessage: "Owner's final summary",
  artifacts: [],
  needsHumanReview: false,
  hasActiveReply: false,
  createdAt: "2026-10-30T12:00:00.000Z",
  updatedAt: "2026-10-30T12:02:00.000Z",
};
const assignment: TaskRun = {
  ...owner,
  id: "assignment-run",
  subtaskId: "assignment-1",
  agentId: "worker",
  finalMessage: "Worker's result",
  createdAt: "2026-10-30T12:01:00.000Z",
};

describe.each([
  ["task page", readPageResult],
  ["task panel", readPanelResult],
] as const)("%s result summary", (_name, readResult) => {
  it("shows the owner result when an assignment was created later", () => {
    expect(readResult([assignment, owner])).toEqual({
      content: owner.finalMessage,
      run: owner,
    });
  });

  it("does not substitute an assignment result for an unanswered owner", () => {
    expect(readResult([assignment, { ...owner, finalMessage: undefined }])).toBeUndefined();
  });

  it("does not show assignment-only history as the owner result", () => {
    expect(readResult([assignment])).toBeUndefined();
  });
});
