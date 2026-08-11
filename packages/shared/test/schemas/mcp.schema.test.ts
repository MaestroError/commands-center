import { describe, expect, it } from "vitest";

import {
  createMcpServerInputSchema,
  toMcpServerName,
  updateMcpServerInputSchema,
} from "../../src/schemas/mcp";

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

describe("toMcpServerName", () => {
  it("replaces a run of unsupported characters with one underscore", () => {
    expect(toMcpServerName("Knowledge  base!")).toBe("knowledge_base");
  });

  it("trims leading and trailing underscores", () => {
    expect(toMcpServerName(" .staging. ")).toBe("staging");
  });

  it("keeps hyphens, which OpenCode does not rewrite", () => {
    expect(toMcpServerName("staging-cc")).toBe("staging-cc");
  });

  // Two labels that derive alike would share one OpenCode tool-id prefix.
  it("derives the same name for a legacy label and its sanitized form", () => {
    expect(toMcpServerName("My Server")).toBe(toMcpServerName("my_server"));
  });

  it("returns an empty string when nothing usable remains", () => {
    expect(toMcpServerName("!!!")).toBe("");
  });
});

describe("updateMcpServerInputSchema", () => {
  it("rejects renaming a server to a name with a space", () => {
    const result = updateMcpServerInputSchema.safeParse({ name: "Knowledge base", config });

    expect(result.success).toBe(false);
  });
});
