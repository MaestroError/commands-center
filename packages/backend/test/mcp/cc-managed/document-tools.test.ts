import { mkdir, readFile, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createId, now } from "../../../src/db/ids";
import { agents } from "../../../src/db/schema";
import { createDocumentToolDefinitions } from "../../../src/mcp/cc-managed/groups/cc-default/tools/document-tools";
import { createTestDatabase } from "../../helpers/db";

type ToolResult = {
  isError?: boolean;
  structuredContent?: unknown;
  content: Array<{ text: string }>;
};

type TestTool = {
  execute: (...args: unknown[]) => Promise<ToolResult>;
};

function makeTools(testDb: Awaited<ReturnType<typeof createTestDatabase>>) {
  const defs = createDocumentToolDefinitions({
    db: testDb.client.db,
    config: testDb.config,
  });

  const listTool = defs.find((d) => d.name === "list_global_documents") as TestTool;
  const registerTool = defs.find((d) => d.name === "register_global_document") as TestTool;
  const listPrivateTool = defs.find((d) => d.name === "list_private_documents") as TestTool;
  const registerPrivateTool = defs.find((d) => d.name === "register_private_document") as TestTool;

  return { listTool, registerTool, listPrivateTool, registerPrivateTool };
}

type RegisterResult = {
  scope: "global" | "private";
  ownerSlug: string | null;
  relativePath: string;
  fullPath: string;
  title: string;
  description: string | null;
  author: string | null;
  created: boolean;
};

const agentContext = { agentSlug: "code-reviewer" };

async function setupDocsDir(testDb: Awaited<ReturnType<typeof createTestDatabase>>) {
  await mkdir(testDb.config.paths.subdirectories.documents, { recursive: true });
}

async function insertActiveSpecialist(
  testDb: Awaited<ReturnType<typeof createTestDatabase>>,
  slug = agentContext.agentSlug,
) {
  const timestamp = now();
  await testDb.client.db.insert(agents).values({
    id: createId(),
    slug,
    name: "Code Reviewer",
    role: "Reviewer",
    instructions: "Review code.",
    default_model: "openai/gpt-5",
    icon_path: null,
    status: "active",
    capabilities_json: JSON.stringify({
      builtInSkills: [],
      workspaceSkills: [],
      customTools: [],
      mcpServers: [],
      appMcpServers: [],
      toolPermissions: [],
    }),
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: null,
  });
}

describe("list_global_documents", () => {
  it("returns empty list when no documents exist", async () => {
    const testDb = await createTestDatabase();
    const { listTool } = makeTools(testDb);

    try {
      await setupDocsDir(testDb);
      const result = await listTool.execute();

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({
        documents: [],
        totalMatches: 0,
        nextOffset: null,
      });
      expect(result.content[0]?.text).toContain("No documents");
    } finally {
      await testDb.cleanup();
    }
  });

  it("lists documents with relative path, full path, title, and description", async () => {
    const testDb = await createTestDatabase();
    const { listTool, registerTool } = makeTools(testDb);

    try {
      await setupDocsDir(testDb);
      await registerTool.execute(
        { path: "design/design.md", title: "Design", description: "System design" },
        agentContext,
      );

      const result = await listTool.execute();

      expect(result.isError).toBeFalsy();
      const docs = (result.structuredContent as { documents: Array<Record<string, unknown>> })
        .documents;
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({
        relativePath: "design/design.md",
        scope: "global",
        ownerSlug: null,
        title: "Design",
        description: "System design",
      });
      expect(result.structuredContent).toMatchObject({ totalMatches: 1, nextOffset: null });
      expect(docs[0]).toHaveProperty("fullPath");
      expect(result.content[0]?.text).toContain("Found 1 of 1");
    } finally {
      await testDb.cleanup();
    }
  });

  it("includes documents added outside the MCP path", async () => {
    const testDb = await createTestDatabase();
    const { listTool } = makeTools(testDb);

    try {
      await setupDocsDir(testDb);
      const docsDir = testDb.config.paths.subdirectories.documents;
      await writeFile(`${docsDir}/external.md`, "# External Doc\n\nDropped in.", "utf8");

      const result = await listTool.execute();

      expect(result.isError).toBeFalsy();
      const docs = (result.structuredContent as { documents: Array<Record<string, unknown>> })
        .documents;
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({
        relativePath: "external.md",
        scope: "global",
        title: "External",
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("filters documents by title and pages matching results", async () => {
    const testDb = await createTestDatabase();
    const { listTool, registerTool } = makeTools(testDb);

    try {
      await setupDocsDir(testDb);
      await registerTool.execute(
        { path: "design/api.md", title: "API Design", description: "System endpoints" },
        agentContext,
      );
      await registerTool.execute(
        { path: "notes/research.md", title: "Research", description: "Market notes" },
        agentContext,
      );

      const result = await listTool.execute({ titleContains: "design", limit: 1 });

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({
        totalMatches: 1,
        nextOffset: null,
      });
      const docs = (result.structuredContent as { documents: Array<Record<string, unknown>> })
        .documents;
      expect(docs.map((doc) => doc["relativePath"])).toEqual(["design/api.md"]);
    } finally {
      await testDb.cleanup();
    }
  });
});

describe("register_global_document", () => {
  it("creates a missing document", async () => {
    const testDb = await createTestDatabase();
    const { registerTool } = makeTools(testDb);

    try {
      await setupDocsDir(testDb);
      const result = await registerTool.execute(
        { path: "notes/notes.md", title: "Notes", description: "Meeting notes" },
        agentContext,
      );

      expect(result.isError).toBeFalsy();
      const output = result.structuredContent as RegisterResult;
      expect(output.created).toBe(true);
      expect(output.scope).toBe("global");
      expect(output.ownerSlug).toBeNull();
      expect(output.relativePath).toBe("notes/notes.md");
      expect(output.title).toBe("Notes");
      expect(output.author).toBe("code-reviewer");

      const content = await readFile(
        `${testDb.config.paths.subdirectories.documents}/notes/notes.md`,
        "utf8",
      );
      expect(content).toBe("");
    } finally {
      await testDb.cleanup();
    }
  });

  it("uses specialist slug as default author", async () => {
    const testDb = await createTestDatabase();
    const { registerTool } = makeTools(testDb);

    try {
      await setupDocsDir(testDb);
      const result = await registerTool.execute(
        { path: "notes/notes.md" },
        { agentSlug: "my-specialist" },
      );

      expect(result.isError).toBeFalsy();
      const output = result.structuredContent as RegisterResult;
      expect(output.author).toBe("my-specialist");
    } finally {
      await testDb.cleanup();
    }
  });

  it("uses explicit author when provided", async () => {
    const testDb = await createTestDatabase();
    const { registerTool } = makeTools(testDb);

    try {
      await setupDocsDir(testDb);
      const result = await registerTool.execute(
        { path: "notes/notes.md", author: "custom-author" },
        agentContext,
      );

      expect(result.isError).toBeFalsy();
      const output = result.structuredContent as RegisterResult;
      expect(output.author).toBe("custom-author");
    } finally {
      await testDb.cleanup();
    }
  });

  it("registers an existing document without overwriting content", async () => {
    const testDb = await createTestDatabase();
    const { registerTool } = makeTools(testDb);

    try {
      await setupDocsDir(testDb);
      const docsDir = testDb.config.paths.subdirectories.documents;
      await mkdir(`${docsDir}/existing`, { recursive: true });
      await writeFile(`${docsDir}/existing/existing.md`, "# Original Content", "utf8");

      const result = await registerTool.execute(
        {
          path: "existing/existing.md",
          title: "Registered Title",
          description: "Registered desc",
        },
        agentContext,
      );

      expect(result.isError).toBeFalsy();
      const output = result.structuredContent as RegisterResult;
      expect(output.created).toBe(false);
      expect(output.title).toBe("Registered Title");

      const content = await readFile(`${docsDir}/existing/existing.md`, "utf8");
      expect(content).toBe("# Original Content");
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns error for invalid paths", async () => {
    const testDb = await createTestDatabase();
    const { registerTool } = makeTools(testDb);

    try {
      await setupDocsDir(testDb);
      const result = await registerTool.execute({ path: "../escape.md" }, agentContext);

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("..");
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns error for non-markdown paths", async () => {
    const testDb = await createTestDatabase();
    const { registerTool } = makeTools(testDb);

    try {
      await setupDocsDir(testDb);
      const result = await registerTool.execute({ path: "notes.txt" }, agentContext);

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain(".md");
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns an error when asked to create a document in the Documents root", async () => {
    const testDb = await createTestDatabase();
    const { registerTool } = makeTools(testDb);

    try {
      await setupDocsDir(testDb);
      const result = await registerTool.execute({ path: "notes.md" }, agentContext);

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("at least one folder under Documents/");
    } finally {
      await testDb.cleanup();
    }
  });

  it("creates nested directory structure when needed", async () => {
    const testDb = await createTestDatabase();
    const { registerTool } = makeTools(testDb);

    try {
      await setupDocsDir(testDb);
      const result = await registerTool.execute(
        { path: "deep/nested/doc.md", title: "Nested Doc" },
        agentContext,
      );

      expect(result.isError).toBeFalsy();
      const output = result.structuredContent as RegisterResult;
      expect(output["created"]).toBe(true);
      expect(output["relativePath"]).toBe("deep/nested/doc.md");
    } finally {
      await testDb.cleanup();
    }
  });
});

describe("private document MCP tools", () => {
  it("returns an empty private list without creating the private Documents folder", async () => {
    const testDb = await createTestDatabase();
    const { listPrivateTool } = makeTools(testDb);

    try {
      await insertActiveSpecialist(testDb);

      const result = await listPrivateTool.execute({}, agentContext);

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({
        documents: [],
        totalMatches: 0,
        nextOffset: null,
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("registers and lists documents in the current specialist private scope", async () => {
    const testDb = await createTestDatabase();
    const { registerPrivateTool, listPrivateTool, listTool } = makeTools(testDb);

    try {
      await setupDocsDir(testDb);
      await insertActiveSpecialist(testDb);

      const registerResult = await registerPrivateTool.execute(
        { path: "notes/private.md", title: "Private Notes" },
        agentContext,
      );
      const listPrivateResult = await listPrivateTool.execute({ query: "private" }, agentContext);
      const listGlobalResult = await listTool.execute({});

      expect(registerResult.isError).toBeFalsy();
      expect(registerResult.structuredContent).toMatchObject({
        scope: "private",
        ownerSlug: agentContext.agentSlug,
        relativePath: "notes/private.md",
        created: true,
      });
      expect(listPrivateResult.structuredContent).toMatchObject({
        totalMatches: 1,
        documents: [
          {
            scope: "private",
            ownerSlug: agentContext.agentSlug,
            relativePath: "notes/private.md",
          },
        ],
      });
      expect(listGlobalResult.structuredContent).toMatchObject({
        documents: [],
        totalMatches: 0,
      });
    } finally {
      await testDb.cleanup();
    }
  });
});
