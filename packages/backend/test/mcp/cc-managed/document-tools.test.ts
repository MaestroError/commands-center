import { mkdir, readFile, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createDocumentToolDefinitions } from "../../../src/mcp/cc-managed/groups/cc-default/tools/document-tools";
import { createTestDatabase } from "../../helpers/db";

function makeTools(testDb: Awaited<ReturnType<typeof createTestDatabase>>) {
  const defs = createDocumentToolDefinitions({
    db: testDb.client.db,
    config: testDb.config,
  });

  const listTool = defs.find((d) => d.name === "list_project_documents")!;
  const registerTool = defs.find((d) => d.name === "register_project_document")!;

  return { listTool, registerTool };
}

type RegisterResult = {
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

describe("list_project_documents", () => {
  it("returns empty list when no documents exist", async () => {
    const testDb = await createTestDatabase();
    const { listTool } = makeTools(testDb);

    try {
      await setupDocsDir(testDb);
      const result = await listTool.execute();

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({ documents: [] });
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
        title: "Design",
        description: "System design",
      });
      expect(docs[0]).toHaveProperty("fullPath");
      expect(result.content[0]?.text).toContain("1 document");
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
        title: "External",
      });
    } finally {
      await testDb.cleanup();
    }
  });
});

describe("register_project_document", () => {
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
      await writeFile(`${docsDir}/existing.md`, "# Original Content", "utf8");

      const result = await registerTool.execute(
        { path: "existing.md", title: "Registered Title", description: "Registered desc" },
        agentContext,
      );

      expect(result.isError).toBeFalsy();
      const output = result.structuredContent as RegisterResult;
      expect(output.created).toBe(false);
      expect(output.title).toBe("Registered Title");

      const content = await readFile(`${docsDir}/existing.md`, "utf8");
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
