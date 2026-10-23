import { describe, expect, it } from "vitest";
import {
  validateMcpToolRules,
  validateMcpToolChanges,
} from "../../src/services/mcp-tool-permission-service.js";

const rule = { server: "mail", tool: "send", action: "allow" as const };
const catalog = [
  {
    server: "mail",
    available: true,
    tools: [{ id: "mail_send", name: "send", description: "Send" }],
  },
];
describe("MCP tool permission validation", () => {
  it("accepts a connected tool", () =>
    expect(() => validateMcpToolRules(catalog, [rule])).not.toThrow());
  it("rejects a new permission for an unavailable server", () =>
    expect(() => validateMcpToolRules([], [rule])).toThrow("not connected"));
  it("preserves an unavailable saved permission", () =>
    expect(() => validateMcpToolRules([], [rule], [rule])).not.toThrow());
  it("rejects edits to an unavailable saved permission", () =>
    expect(() => validateMcpToolRules([], [{ ...rule, action: "deny" }], [rule])).toThrow(
      "not connected",
    ));
  it("allows removal of unavailable saved permissions", () =>
    expect(() => validateMcpToolRules([], [], [rule])).not.toThrow());
  it("rejects duplicate entries", () =>
    expect(() => validateMcpToolRules(catalog, [rule, rule])).toThrow("Duplicate"));
});

it("preserves unchanged rules while discovery is unavailable", async () => {
  await expect(
    validateMcpToolChanges(() => Promise.reject(new Error("Engine unavailable")), [rule], [rule]),
  ).resolves.toBeUndefined();
});
it("removes rules while discovery is unavailable", async () => {
  await expect(
    validateMcpToolChanges(() => Promise.reject(new Error("Engine unavailable")), [], [rule]),
  ).resolves.toBeUndefined();
});
