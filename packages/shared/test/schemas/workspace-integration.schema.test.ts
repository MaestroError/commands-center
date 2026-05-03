import { describe, expect, it } from "vitest";

import {
  createWorkspaceSkillInputSchema,
  customToolSchema,
  globalSearchQuerySchema,
  secretMetaSchema,
  setSecretRequestSchema,
  workspaceSkillUploadInputSchema,
} from "../../src/schemas/index.js";
import {
  fileManagerDirectorySearchQuerySchema,
  fileManagerPreferencesSchema,
  workspaceWatchEventSchema,
} from "../../src/schemas/file-manager.js";
import {
  createMcpServerInputSchema,
  mcpRuntimeStatusSchema,
  mcpServerConfigSchema,
} from "../../src/schemas/mcp.js";
import {
  opencodeFileContentSchema,
  opencodeFileListQuerySchema,
  opencodeFileSearchQuerySchema,
} from "../../src/schemas/opencode-files.js";

describe("workspace integration schemas", () => {
  it("coerces file manager directory limits and applies preference defaults", () => {
    expect(
      fileManagerDirectorySearchQuerySchema.parse({
        root: "workspace",
        query: " src ",
        limit: "25",
      }),
    ).toEqual({
      root: "workspace",
      query: "src",
      limit: 25,
    });

    expect(fileManagerPreferencesSchema.parse({})).toEqual({
      allowHostFilesystemEdits: false,
      fileUploads: {
        maxUploadSizeBytes: 50 * 1024 * 1024,
        allowDangerousFiles: false,
      },
    });

    expect(() =>
      fileManagerDirectorySearchQuerySchema.parse({ root: "workspace", limit: 0 }),
    ).toThrow();
  });

  it("parses workspace watch events", () => {
    expect(
      workspaceWatchEventSchema.parse({
        type: "heartbeat",
        properties: {},
      }),
    ).toEqual({ type: "heartbeat", properties: {} });

    expect(
      workspaceWatchEventSchema.parse({
        type: "workspace.changed",
        properties: { version: 3 },
      }),
    ).toEqual({
      type: "workspace.changed",
      properties: { version: 3 },
    });
  });

  it("parses workspace skill input and upload payloads", () => {
    expect(
      createWorkspaceSkillInputSchema.parse({
        name: "  Deploy Helper  ",
        category: "  ops  ",
        description: "  Helps with release tasks  ",
      }),
    ).toEqual({
      name: "Deploy Helper",
      category: "ops",
      description: "Helps with release tasks",
    });

    expect(
      workspaceSkillUploadInputSchema.parse({
        entries: [
          {
            name: "SKILL.md",
            relativePath: "deploy/SKILL.md",
            contentBase64: "Zm9v",
            sizeBytes: 3,
          },
        ],
      }),
    ).toEqual({
      entries: [
        {
          name: "SKILL.md",
          relativePath: "deploy/SKILL.md",
          contentBase64: "Zm9v",
          sizeBytes: 3,
        },
      ],
      overwrite: false,
    });
  });

  it("applies defaults for custom tools and global search queries", () => {
    expect(
      customToolSchema.parse({
        id: "tool_1",
        slug: "workspace-snapshot",
        name: "Workspace Snapshot",
        description: "",
        entryFile: "main.ts",
        entryPath: "/tools/workspace-snapshot/main.ts",
        directoryPath: "/tools/workspace-snapshot",
        fingerprint: "abc123",
        enabled: true,
        createdAt: "2026-05-03T12:00:00.000Z",
        updatedAt: "2026-05-03T12:00:01.000Z",
      }),
    ).toMatchObject({ warnings: [], usage: [] });

    expect(globalSearchQuerySchema.parse({ query: "  error boundary  " })).toEqual({
      query: "error boundary",
    });

    expect(() => globalSearchQuerySchema.parse({ query: "   " })).toThrow();
  });

  it("parses MCP server configs and runtime states", () => {
    expect(
      mcpServerConfigSchema.parse({
        transport: "sse",
        url: "https://example.com/mcp",
        authMethod: "headers",
      }),
    ).toEqual({
      transport: "sse",
      url: "https://example.com/mcp",
      authMethod: "headers",
      headers: [],
    });

    expect(
      createMcpServerInputSchema.parse({
        name: "GitHub",
        config: {
          transport: "stdio",
          command: ["npx", "-y", "github-mcp-server"],
        },
      }),
    ).toMatchObject({ enabled: true });

    expect(mcpRuntimeStatusSchema.parse({ status: "failed", error: "boom" })).toEqual({
      status: "failed",
      error: "boom",
    });
  });

  it("coerces opencode file search limits and parses content payloads", () => {
    expect(opencodeFileSearchQuerySchema.parse({ query: "src", limit: "5" })).toEqual({
      query: "src",
      limit: 5,
    });

    expect(opencodeFileListQuerySchema.parse({})).toEqual({ path: "." });

    expect(
      opencodeFileContentSchema.parse({
        type: "text",
        content: "hello",
        diff: "@@ -1 +1 @@",
        patch: {
          oldFileName: "a.txt",
          newFileName: "a.txt",
          hunks: [
            {
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 1,
              lines: ["-old", "+new"],
            },
          ],
        },
      }),
    ).toBeTruthy();
  });

  it("parses secret metadata and set-secret requests", () => {
    expect(
      secretMetaSchema.parse({
        key: "GITHUB_TOKEN",
        isSet: true,
        updatedAt: "2026-05-03T12:00:00.000Z",
      }),
    ).toEqual({
      key: "GITHUB_TOKEN",
      isSet: true,
      updatedAt: "2026-05-03T12:00:00.000Z",
    });

    expect(setSecretRequestSchema.parse({ value: "" })).toEqual({ value: "" });
  });
});
