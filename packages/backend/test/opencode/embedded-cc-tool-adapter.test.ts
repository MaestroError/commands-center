import type { Tool } from "@opencode/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type {
  CcManagedToolContext,
  CcManagedToolDefinition,
} from "../../src/mcp/cc-managed/server-registry.js";
import { createEmbeddedCcTools } from "../../src/opencode/embedded-cc-tool-adapter.js";
import type { EmbeddedToolCaller } from "../../src/opencode/embedded-tool-caller.js";

function fixture(overrides: Partial<CcManagedToolDefinition> = {}, rejectAuthorization = false) {
  const calls: CcManagedToolContext[] = [];
  const approvals: string[] = [];
  const caller: EmbeddedToolCaller = {
    context: "chat",
    conversationId: "conversation",
    agentId: "agent",
    agentSlug: "alpha",
    sessionID: "session",
    ownerSessionID: "session",
  };
  const controller = new AbortController();
  const execution: Tool.Context = {
    sessionID: "session" as Tool.Context["sessionID"],
    messageID: "message" as Tool.Context["messageID"],
    id: "call" as Tool.Context["id"],
    agent: "build" as Tool.Context["agent"],
    signal: controller.signal,
    progress: () => Promise.resolve(),
  };
  const definition: CcManagedToolDefinition = {
    name: "example",
    description: "Example",
    context: "chat",
    inputSchema: z.object({ value: z.string() }),
    outputSchema: z.object({ value: z.string() }),
    execute: (_args, context) => {
      calls.push(context);
      return { content: [{ type: "text", text: "Done" }], structuredContent: { value: "Done" } };
    },
    ...overrides,
  };
  const [tool] = createEmbeddedCcTools({
    directory: "/specialists/alpha",
    groups: [
      {
        name: "cc_default",
        routeSegment: "default",
        description: "Default",
        enabledByDefault: true,
        companionPromptId: null,
        catalogTools: [definition],
        tools: [definition],
      },
    ],
    resolveCaller: () => Promise.resolve(caller),
    authorize: ({ toolID }) => {
      if (rejectAuthorization) return Promise.reject(new Error("Tool permission denied"));
      approvals.push(toolID);
      return Promise.resolve();
    },
  });
  return { tool: tool!, calls, approvals, caller, execution, controller };
}

describe("embedded CC tool adapter", () => {
  it("preserves the group namespace", () => {
    expect(fixture().tool.options).toEqual({ namespace: "cc_default", codemode: false });
  });
  it("converts the existing input schema to JSON schema", () => {
    expect(fixture().tool.input).toMatchObject({
      type: "object",
      properties: { value: { type: "string" } },
    });
  });
  it("passes trusted caller identity to the existing handler", async () => {
    const f = fixture();
    await f.tool.execute({ value: "test", agentSlug: "forged" }, f.execution);
    expect(f.calls).toEqual([
      {
        agentSlug: "alpha",
        caller: f.caller,
        signal: expect.any(AbortSignal),
        messageID: "message",
        callID: "call",
      },
    ]);
  });
  it("authorizes the effective namespaced tool before execution", async () => {
    const f = fixture();
    await f.tool.execute({ value: "test" }, f.execution);
    expect(f.approvals).toEqual(["cc_default_example"]);
  });
  it("preserves structured results", async () => {
    const f = fixture();
    expect(await f.tool.execute({ value: "test" }, f.execution)).toEqual({
      content: [{ type: "text", text: "Done" }],
      output: { value: "Done" },
    });
  });
  it("registers the schema required for SDK structured results", () => {
    expect(fixture().tool.output).toMatchObject({
      type: "object",
      properties: { value: { type: "string" } },
    });
  });
  it("uses text content when a legacy definition has no output schema", async () => {
    const f = fixture({ outputSchema: undefined });
    expect(await f.tool.execute({ value: "test" }, f.execution)).toEqual({
      content: [{ type: "text", text: "Done" }],
    });
  });
  it("does not reach the handler when permission is denied", async () => {
    const f = fixture({}, true);
    await expect(f.tool.execute({ value: "test" }, f.execution)).rejects.toThrow(
      "permission denied",
    );
    expect(f.calls).toEqual([]);
  });
  it("rejects a wrong-context call before reaching the handler", async () => {
    const f = fixture({ context: "task_run" });
    await expect(f.tool.execute({ value: "test" }, f.execution)).rejects.toThrow("session context");
    expect(f.calls).toEqual([]);
  });
  it("accepts a both-context tool in chat", async () => {
    const f = fixture({ context: "both" });
    await expect(f.tool.execute({ value: "test" }, f.execution)).resolves.toMatchObject({
      output: { value: "Done" },
    });
  });
  it("rejects invalid input before reaching the handler", async () => {
    const f = fixture();
    await expect(f.tool.execute({ value: 123 }, f.execution)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
  it("reports MCP-style tool failures as SDK execution errors", async () => {
    const f = fixture({
      execute: () => ({ isError: true, content: [{ type: "text", text: "Failed operation" }] }),
    });
    await expect(f.tool.execute({ value: "test" }, f.execution)).rejects.toThrow(
      "Failed operation",
    );
  });
  it("does not execute after cancellation", async () => {
    const f = fixture();
    f.controller.abort();
    await expect(f.tool.execute({ value: "test" }, f.execution)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
});
