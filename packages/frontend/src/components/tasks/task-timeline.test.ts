import { describe, expect, it } from "vitest";
import { taskRunSchema, taskSubtaskSchema, type TaskRunFollowup } from "@cc/shared/schemas";
import { buildTaskTimeline } from "./task-timeline";

const run = taskRunSchema.parse({
  id: "owner-run",
  taskId: "task",
  agentId: "owner",
  status: "completed",
  triggerSource: "manual",
  needsHumanReview: false,
  renderedPrompt: "Goal",
  initialOutcomeText: "First answer",
  initialOutcomeAt: "2026-10-30T10:01:00Z",
  finalMessage: "Latest answer",
  createdAt: "2026-10-30T10:00:00Z",
  updatedAt: "2026-10-30T10:04:00Z",
});
const reply: TaskRunFollowup = {
  id: "reply",
  taskId: "task",
  runId: run.id,
  kind: "operator_reply",
  status: "answered",
  body: "Please revise",
  answerBody: "Latest answer",
  createdAt: "2026-10-30T10:02:00Z",
  answeredAt: "2026-10-30T10:04:00Z",
};

describe("task timeline", () => {
  it.each([
    ["queued", "queued", "queued for the owner's next available turn"],
    ["delivering", "delivering", "CC is delivering"],
    ["sending", "delivered", "was delivered to the owner session"],
    ["answered", "answered", "owner responded"],
    ["handled", "already_handled", "already accepted this assignment"],
    ["cancelled", "cancelled", "notification was cancelled"],
    ["blocked", "blocked", "delivery needs attention"],
    ["failed", "failed", "did not receive a successful owner response"],
  ] as const)("describes a %s team notification accurately", (status, statusLabel, body) => {
    const entry = buildTaskTimeline(
      [run],
      [
        {
          ...reply,
          kind: "team_result",
          status,
          answerBody: undefined,
        },
      ],
      [],
    ).find((item) => item.id === "reply:reply");
    expect(entry).toMatchObject({ title: "Assignment result notification", statusLabel });
    expect(entry?.body).toContain(body);
  });
  it("interleaves user input with the original response and subsequent answer", () => {
    expect(buildTaskTimeline([run], [reply], []).map((entry) => entry.id)).toEqual([
      "execution:owner-run",
      "outcome:owner-run",
      "reply:reply",
      "answer:reply",
    ]);
  });
  it("preserves the original owner response after a continuation", () => {
    expect(
      buildTaskTimeline([run], [reply], []).find((entry) => entry.id === "outcome:owner-run")?.body,
    ).toBe("First answer");
  });
  it("shows pending feedback before an execution exists", () => {
    expect(
      buildTaskTimeline(
        [],
        [{ ...reply, runId: undefined, status: "queued", answerBody: undefined }],
        [],
      ),
    ).toMatchObject([{ title: "You replied", body: "Please revise" }]);
  });
  it("puts delegation in the same chronology as user messages", () => {
    const assignment = taskSubtaskSchema.parse({
      id: "worker",
      taskId: "task",
      agentId: "designer",
      ownerRunId: run.id,
      description: "Create a visual",
      expectedOutput: "Image",
      createdAt: "2026-10-30T10:03:00Z",
      updatedAt: "2026-10-30T10:03:00Z",
    });
    expect(buildTaskTimeline([run], [reply], [assignment]).map((entry) => entry.id)).toEqual([
      "execution:owner-run",
      "outcome:owner-run",
      "reply:reply",
      "assignment:worker",
      "answer:reply",
    ]);
  });
  it("keeps durable stop events after the run has resumed", () => {
    expect(
      buildTaskTimeline(
        [run],
        [{ ...reply, kind: "lifecycle", body: "Stopped by operator", answerBody: undefined }],
        [],
      ),
    ).toContainEqual(
      expect.objectContaining({ title: "Execution event", body: "Stopped by operator" }),
    );
  });
});
