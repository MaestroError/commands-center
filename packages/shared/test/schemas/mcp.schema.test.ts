import { describe, expect, it } from "vitest";

import { createMcpServerInputSchema, updateMcpServerInputSchema } from "../../src/schemas/mcp";

const config = {
  transport: "streamable-http" as const,
  url: "https://cc.example.com/api/public/mcp",
  authMethod: "headers" as const,
  headers: [{ key: "Authorization", value: "Bearer {env:CC_TOKEN}" }],
};

describe("createMcpServerInputSchema", () => {
  it("accepts letters, digits, underscores, and hyphens in a name", () => {
    const parsed = createMcpServerInputSchema.parse({ name: "knowledge_base-2", config });

    expect(parsed.name).toBe("knowledge_base-2");
  });

  // OpenCode rewrites anything outside [A-Za-z0-9_-] when deriving tool ids, so a
  // stored name containing a space would never match its own permission pattern.
  it("rejects a name containing a space", () => {
    const result = createMcpServerInputSchema.safeParse({ name: "Knowledge base", config });

    expect(result.success).toBe(false);
  });

  it("rejects a name containing a dot", () => {
    const result = createMcpServerInputSchema.safeParse({ name: "cc.example", config });

    expect(result.success).toBe(false);
  });

  it("explains the allowed characters when a name is rejected", () => {
    const result = createMcpServerInputSchema.safeParse({ name: "Knowledge base", config });

    expect(result.error?.issues[0]?.message).toBe(
      "MCP server name may only contain letters, digits, underscores, and hyphens.",
    );
  });
});

describe("updateMcpServerInputSchema", () => {
  it("rejects renaming a server to a name with a space", () => {
    const result = updateMcpServerInputSchema.safeParse({ name: "Knowledge base", config });

    expect(result.success).toBe(false);
  });
});
