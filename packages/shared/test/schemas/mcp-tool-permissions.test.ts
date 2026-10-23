import { describe, expect, it } from "vitest";
import {
  resolveMcpToolDefault,
  createTaskInputSchema,
  createTaskTemplateInputSchema,
  updateTaskInputSchema,
  updateTaskTemplateInputSchema,
} from "../../src/schemas/index.js";

describe("MCP tool permission contracts", () => {
  it("resolves legacy wildcard tool rules", () => {
    expect(
      resolveMcpToolDefault({ toolPermissions: [{ pattern: "mail_*", action: "deny" }] }, "mail", {
        id: "mail_send",
        name: "send",
      }),
    ).toBe("deny");
  });
  it("gives exact MCP defaults precedence over legacy rules", () => {
    expect(
      resolveMcpToolDefault(
        {
          toolPermissions: [{ pattern: "mail_*", action: "deny" }],
          mcpToolPermissions: [{ server: "mail", tool: "send", action: "ask" }],
        },
        "mail",
        { id: "mail_send", name: "send" },
      ),
    ).toBe("ask");
  });
  for (const [name, schema, input] of [
    ["task create", createTaskInputSchema, { agentId: "a", title: "Task" }],
    ["task edit", updateTaskInputSchema, {}],
    ["template create", createTaskTemplateInputSchema, { defaultAgentId: "a", title: "Template" }],
    ["template edit", updateTaskTemplateInputSchema, {}],
  ] as const)
    it(`rejects ask on ${name}`, () => {
      expect(
        schema.safeParse({
          ...input,
          permissionProfile: {
            mcpToolPermissions: [{ server: "mail", tool: "send", action: "ask" }],
          },
        }).success,
      ).toBe(false);
    });
});
