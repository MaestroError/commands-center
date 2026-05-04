import { describe, expect, it } from "vitest";

import { getRouteTitle, matchesRoute } from "./routes";

describe("matchesRoute", () => {
  it("returns false when segment counts differ", () => {
    expect(matchesRoute("/chat/agent-1/conv-1", "/chat/:agentId")).toBe(false);
  });

  it("matches wildcard param segments", () => {
    expect(matchesRoute("/chat/agent-1/conv-1", "/chat/:agentId/:conversationId")).toBe(true);
  });

  it("exactly matches the root route", () => {
    expect(matchesRoute("/", "/")).toBe(true);
  });
});

describe("getRouteTitle", () => {
  it('returns "Direct Chat" for the /chat/:agentId shape', () => {
    expect(getRouteTitle("/chat/agent-1")).toBe("Direct Chat");
  });

  it('returns "Direct Chat" for the /chat/:agentId/:conversationId shape', () => {
    expect(getRouteTitle("/chat/agent-1/conv-1")).toBe("Direct Chat");
  });

  it('returns "Tasks" for the task list route', () => {
    expect(getRouteTitle("/tasks")).toBe("Tasks");
  });

  it('returns "Task Run" for task run details', () => {
    expect(getRouteTitle("/tasks/task-1/runs/run-1")).toBe("Task Run");
  });

  it("returns the fallback title for unknown paths", () => {
    expect(getRouteTitle("/unknown/path")).toBe("CommandsCenter");
  });
});
