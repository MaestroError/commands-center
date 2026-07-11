import { describe, expect, it } from "vitest";

import {
  deriveMcpToolName,
  isReservedMcpToolName,
  mcpToolNameSchema,
  taskTemplateMcpConfigSchema,
} from "../../src/schemas/task-template-mcp.js";

describe("deriveMcpToolName", () => {
  it("sanitizes a title into an MCP-safe identifier", () => {
    expect(deriveMcpToolName("Create LinkedIn Post")).toBe("create_linkedin_post");
    expect(deriveMcpToolName("Weekly  Report!!!")).toBe("weekly_report");
  });

  it("ensures a leading letter and a valid, non-empty result", () => {
    expect(deriveMcpToolName("123 go")).toBe("t_123_go");
    // Symbol-only / empty titles still yield a valid MCP identifier.
    for (const input of ["!!!", "", "___"]) {
      const name = deriveMcpToolName(input);
      expect(name.length).toBeGreaterThan(0);
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("caps the length", () => {
    expect(deriveMcpToolName("a".repeat(200)).length).toBeLessThanOrEqual(64);
  });
});

describe("isReservedMcpToolName", () => {
  it("reserves core names and the _async suffix", () => {
    expect(isReservedMcpToolName("task_run")).toBe(true);
    expect(isReservedMcpToolName("get_task_result")).toBe(true);
    expect(isReservedMcpToolName("anything_async")).toBe(true);
  });

  it("allows unreserved names", () => {
    expect(isReservedMcpToolName("create_linkedin_post")).toBe(false);
  });
});

describe("mcpToolNameSchema", () => {
  it("accepts lowercase identifiers starting with a letter", () => {
    expect(mcpToolNameSchema.safeParse("make_report").success).toBe(true);
  });

  it("rejects uppercase, leading digits, and empty", () => {
    expect(mcpToolNameSchema.safeParse("MakeReport").success).toBe(false);
    expect(mcpToolNameSchema.safeParse("1report").success).toBe(false);
    expect(mcpToolNameSchema.safeParse("").success).toBe(false);
  });
});

describe("taskTemplateMcpConfigSchema", () => {
  it("applies defaults around a provided tool name", () => {
    const parsed = taskTemplateMcpConfigSchema.parse({ toolName: "make_report" });
    expect(parsed).toMatchObject({
      syncEnabled: true,
      toolName: "make_report",
      allowFiles: true,
      asyncEnabled: false,
      asyncAlwaysAcknowledge: false,
      artifacts: { displayableUrlEnabled: true, downloadableUrlEnabled: true },
    });
  });

  it("normalizes legacy exposure without broadening async access", () => {
    expect(
      taskTemplateMcpConfigSchema.parse({
        toolName: "hidden_report",
        exposeAsTool: false,
        asyncEnabled: true,
      }),
    ).toMatchObject({ syncEnabled: false, asyncEnabled: false });
    expect(
      taskTemplateMcpConfigSchema.parse({
        toolName: "visible_report",
        exposeAsTool: true,
        asyncEnabled: true,
      }),
    ).toMatchObject({ syncEnabled: true, asyncEnabled: true });
  });

  it("fails closed for malformed legacy exposure values", () => {
    expect(
      taskTemplateMcpConfigSchema.parse({
        toolName: "malformed_legacy",
        exposeAsTool: "false",
        asyncEnabled: true,
      }),
    ).toMatchObject({ syncEnabled: false, asyncEnabled: false });
  });

  it("requires a tool name", () => {
    expect(taskTemplateMcpConfigSchema.safeParse({}).success).toBe(false);
  });
});
