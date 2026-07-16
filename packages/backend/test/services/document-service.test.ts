import { mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { createId, now } from "../../src/db/ids";
import { agents, documents } from "../../src/db/schema/index";
import { createDocumentService, documentReconciler } from "../../src/services/document-service";
import { createTestDatabase } from "../helpers/db";

const logger = { warn: () => {}, debug: () => {}, error: () => {} } as never;

function makeService(testDb: Awaited<ReturnType<typeof createTestDatabase>>) {
  return createDocumentService({
    db: testDb.client.db,
    config: testDb.config,
  });
}

async function setupDocsDir(testDb: Awaited<ReturnType<typeof createTestDatabase>>) {
  await mkdir(testDb.config.paths.subdirectories.documents, { recursive: true });
}

async function insertSpecialist(
  testDb: Awaited<ReturnType<typeof createTestDatabase>>,
  input: { slug: string; name?: string; status?: "active" | "archived" },
): Promise<string> {
  const timestamp = now();
  const id = createId();
  await testDb.client.db.insert(agents).values({
    id,
    slug: input.slug,
    name: input.name ?? input.slug,
    role: "Specialist",
    instructions: "Do specialist work.",
    default_model: "openai/gpt-5",
    icon_path: null,
    status: input.status ?? "active",
    capabilities_json: JSON.stringify({
      builtInSkills: [],
      workspaceSkills: [],
      customTools: [],
      mcpServers: [],
      toolPermissions: [],
      appMcpServers: [],
      appToolPermissions: [],
    }),
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: input.status === "archived" ? timestamp : null,
  });
  return id;
}

// ---------------------------------------------------------------------------
// Document service
// ---------------------------------------------------------------------------

describe("document service", () => {
  describe("create", () => {
    it("creates a document file and inserts a DB row", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        const result = await service.create({
          path: "notes/notes.md",
          title: "My Notes",
          description: "Some notes",
          author: "operator",
        });

        expect(result.relativePath).toBe("notes/notes.md");
        expect(result.title).toBe("My Notes");
        expect(result.author).toBe("operator");

        const content = await readFile(service.fullPath("notes/notes.md"), "utf8");
        expect(content).toBe("");

        const rows = await testDb.client.db.select().from(documents);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.relative_path).toBe("notes/notes.md");
        expect(rows[0]?.title).toBe("My Notes");
      } finally {
        await testDb.cleanup();
      }
    });

    it("creates a document with initial content", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({
          path: "design/design.md",
          content: "# Design\n\nArchitecture overview.",
        });

        const content = await readFile(service.fullPath("design/design.md"), "utf8");
        expect(content).toBe("# Design\n\nArchitecture overview.");
      } finally {
        await testDb.cleanup();
      }
    });

    it("creates parent directories automatically", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({ path: "deep/nested/doc.md" });

        const fileStat = await stat(service.fullPath("deep/nested/doc.md"));
        expect(fileStat.isFile()).toBe(true);
      } finally {
        await testDb.cleanup();
      }
    });

    it("allows global and private documents to share the same relative path", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        const ownerSpecialistId = await insertSpecialist(testDb, { slug: "planner" });

        await service.create({ path: "notes/shared.md", title: "Global Notes" });
        const privateDocument = await service.create({
          scope: "private",
          ownerSpecialistId,
          path: "notes/shared.md",
          title: "Private Notes",
        });

        const rows = await testDb.client.db.select().from(documents);
        expect(rows).toHaveLength(2);
        expect(privateDocument).toMatchObject({
          scope: "private",
          ownerSlug: "planner",
          ownerSpecialistId,
          relativePath: "notes/shared.md",
          title: "Private Notes",
        });
      } finally {
        await testDb.cleanup();
      }
    });

    it("resolves private documents by owner ID after the owner slug changes", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        const ownerSpecialistId = await insertSpecialist(testDb, { slug: "planner" });
        await testDb.client.db
          .update(agents)
          .set({ slug: "renamed-planner" })
          .where(eq(agents.id, ownerSpecialistId));

        const document = await service.create({
          scope: "private",
          ownerSpecialistId,
          ownerSlug: "planner",
          path: "notes/renamed.md",
        });

        expect(document.ownerSlug).toBe("renamed-planner");
        expect((await stat(document.fullPath)).isFile()).toBe(true);
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects duplicate documents", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({ path: "notes/notes.md" });
        await expect(service.create({ path: "notes/notes.md" })).rejects.toThrow("already exists");
      } finally {
        await testDb.cleanup();
      }
    });

    it("derives title from filename when title is not provided", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        const result = await service.create({ path: "design/my-design-doc.md" });
        expect(result.title).toBe("My Design Doc");
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects creating documents directly in the Documents root", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await expect(service.create({ path: "notes.md" })).rejects.toThrow(
          "at least one folder under Documents/",
        );
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects absolute paths", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await expect(service.create({ path: "/etc/passwd.md" })).rejects.toThrow("relative");
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects path traversal", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await expect(service.create({ path: "../escape.md" })).rejects.toThrow("..");
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects hidden segments", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await expect(service.create({ path: ".hidden/notes.md" })).rejects.toThrow("hidden");
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects backslashes so persisted paths stay portable", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await expect(service.create({ path: "design\\overview.md" })).rejects.toThrow("backslash");
        await expect(service.create({ path: "foo\\.hidden\\bar.md" })).rejects.toThrow("backslash");
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects Windows drive-letter absolute paths", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await expect(service.create({ path: "C:\\notes.md" })).rejects.toThrow("relative");
        await expect(service.create({ path: "C:/notes.md" })).rejects.toThrow("relative");
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects non-markdown extensions", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await expect(service.create({ path: "notes/notes.txt" })).rejects.toThrow(".md");
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects content exceeding the maximum allowed size without writing a file", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        const oversized = "a".repeat(5 * 1024 * 1024 + 1);
        await expect(service.create({ path: "large/big.md", content: oversized })).rejects.toThrow(
          "exceeds the maximum allowed size",
        );
        await expect(stat(service.fullPath("large/big.md"))).rejects.toMatchObject({
          code: "ENOENT",
        });
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects unknown private owners", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await expect(
          service.create({
            scope: "private",
            ownerSlug: "missing",
            path: "notes/notes.md",
          }),
        ).rejects.toThrow("Private document owner not found");
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects archived private owners", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await insertSpecialist(testDb, { slug: "old-planner", status: "archived" });

        await expect(
          service.create({
            scope: "private",
            ownerSlug: "old-planner",
            path: "notes/notes.md",
          }),
        ).rejects.toThrow("Private document owner not found");
      } finally {
        await testDb.cleanup();
      }
    });
  });

  describe("createFolder", () => {
    it("creates a nested folder structure", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.createFolder("specs/api");

        const folderStat = await stat(service.fullPath("specs/api"));
        expect(folderStat.isDirectory()).toBe(true);
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects path traversal in folder path", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await expect(service.createFolder("../escape")).rejects.toThrow("..");
      } finally {
        await testDb.cleanup();
      }
    });
  });

  describe("read", () => {
    it("reads content and metadata from a document", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({
          path: "notes/notes.md",
          title: "My Notes",
          description: "Test notes",
          content: "# Hello\n\nWorld",
        });

        const result = await service.read("notes/notes.md");
        expect(result.relativePath).toBe("notes/notes.md");
        expect(result.title).toBe("My Notes");
        expect(result.description).toBe("Test notes");
        expect(result.content).toBe("# Hello\n\nWorld");
        expect(result.revision.sizeBytes).toBeGreaterThan(0);
        expect(result.revision.mtimeMs).toBeGreaterThan(0);
      } finally {
        await testDb.cleanup();
      }
    });

    it("returns fallback metadata for an unregistered document", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        const absPath = service.fullPath("external-doc.md");
        await writeFile(absPath, "# External\n\nDropped in directly.", "utf8");

        const result = await service.read("external-doc.md");
        expect(result.title).toBe("External Doc");
        expect(result.description).toBe("Dropped in directly.");
        expect(result.author).toBeNull();
        expect(result.createdAt).toBeNull();
      } finally {
        await testDb.cleanup();
      }
    });

    it("throws for a non-existent document", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await expect(service.read("missing.md")).rejects.toThrow("not found");
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects a symlinked markdown file that resolves outside the Documents root", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        const outside = join(testDb.config.paths.workspaceDir, "secret.md");
        await writeFile(outside, "Outside document root", "utf8");
        await symlink(outside, service.fullPath("linked.md"));

        await expect(service.read("linked.md")).rejects.toThrow("not found");
      } finally {
        await testDb.cleanup();
      }
    });
  });

  describe("saveContent", () => {
    it("saves content and returns updated revision", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({ path: "notes/notes.md", content: "old" });
        const doc = await service.read("notes/notes.md");

        const result = await service.saveContent({
          path: "notes/notes.md",
          content: "new content",
          expectedRevision: doc.revision,
        });

        expect(result.revision.sizeBytes).toBe(11);
        const content = await readFile(service.fullPath("notes/notes.md"), "utf8");
        expect(content).toBe("new content");
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects save on revision conflict", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({ path: "notes/notes.md", content: "original" });
        const doc = await service.read("notes/notes.md");

        // Simulate external modification.
        await writeFile(service.fullPath("notes/notes.md"), "modified externally", "utf8");

        await expect(
          service.saveContent({
            path: "notes/notes.md",
            content: "my change",
            expectedRevision: doc.revision,
          }),
        ).rejects.toThrow("modified since last read");
      } finally {
        await testDb.cleanup();
      }
    });

    it("throws for a non-existent document", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await expect(
          service.saveContent({
            path: "missing.md",
            content: "test",
            expectedRevision: { mtimeMs: 0, sizeBytes: 0 },
          }),
        ).rejects.toThrow("not found");
      } finally {
        await testDb.cleanup();
      }
    });

    it("rejects content exceeding the maximum allowed size without overwriting the file", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({ path: "notes/notes.md", content: "original" });
        const doc = await service.read("notes/notes.md");

        const oversized = "a".repeat(5 * 1024 * 1024 + 1);
        await expect(
          service.saveContent({
            path: "notes/notes.md",
            content: oversized,
            expectedRevision: doc.revision,
          }),
        ).rejects.toThrow("exceeds the maximum allowed size");

        const content = await readFile(service.fullPath("notes/notes.md"), "utf8");
        expect(content).toBe("original");
      } finally {
        await testDb.cleanup();
      }
    });
  });

  describe("updateMetadata", () => {
    it("updates metadata on an existing document", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({ path: "notes/notes.md", title: "Old Title" });

        const result = await service.updateMetadata({
          path: "notes/notes.md",
          title: "New Title",
          description: "New description",
        });

        expect(result.title).toBe("New Title");
        expect(result.description).toBe("New description");

        const rows = await testDb.client.db.select().from(documents);
        expect(rows[0]?.title).toBe("New Title");
      } finally {
        await testDb.cleanup();
      }
    });

    it("creates a DB row for a document that exists on disk but not in DB", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await writeFile(service.fullPath("external.md"), "# Ext", "utf8");

        const result = await service.updateMetadata({
          path: "external.md",
          title: "External Doc",
        });

        expect(result.title).toBe("External Doc");
        const rows = await testDb.client.db.select().from(documents);
        expect(rows).toHaveLength(1);
      } finally {
        await testDb.cleanup();
      }
    });

    it("throws for a document not on disk", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await expect(
          service.updateMetadata({ path: "missing.md", title: "Title" }),
        ).rejects.toThrow("not found");
      } finally {
        await testDb.cleanup();
      }
    });
  });

  describe("getTree", () => {
    it("returns a sorted tree with folders first", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.createFolder("design");
        await service.create({ path: "design/overview.md", title: "Overview" });
        await writeFile(join(service.documentsRoot(), "readme.md"), "# Readme", "utf8");

        const tree = await service.getTree();
        expect(tree).toHaveLength(2);
        expect(tree[0]?.type).toBe("directory");
        expect(tree[0]?.name).toBe("design");
        expect(tree[0]?.children).toHaveLength(1);
        expect(tree[1]?.type).toBe("file");
        expect(tree[1]?.name).toBe("readme.md");
      } finally {
        await testDb.cleanup();
      }
    });

    it("excludes hidden directories and non-markdown files", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        const root = service.documentsRoot();
        await mkdir(join(root, ".hidden"), { recursive: true });
        await writeFile(join(root, ".hidden", "secret.md"), "secret", "utf8");
        await writeFile(join(root, "notes.txt"), "not markdown", "utf8");
        await writeFile(join(root, "readme.md"), "# Readme", "utf8");

        const tree = await service.getTree();
        expect(tree).toHaveLength(1);
        expect(tree[0]?.name).toBe("readme.md");
      } finally {
        await testDb.cleanup();
      }
    });

    it("returns empty tree when Documents folder is empty", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        const tree = await service.getTree();
        expect(tree).toEqual([]);
      } finally {
        await testDb.cleanup();
      }
    });
  });

  describe("list", () => {
    it("lists all documents recursively with fallback metadata", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({ path: "notes/notes.md", title: "Notes" });
        await service.create({ path: "design/overview.md" });

        const items = await service.list();
        expect(items).toHaveLength(2);
        const paths = items.map((i) => i.relativePath);
        expect(paths).toContain("notes/notes.md");
        expect(paths).toContain("design/overview.md");
      } finally {
        await testDb.cleanup();
      }
    });

    it("uses fallback title from filename for docs without DB metadata", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await writeFile(service.fullPath("my-external-doc.md"), "# Content", "utf8");

        const items = await service.list();
        expect(items).toHaveLength(1);
        expect(items[0]?.title).toBe("My External Doc");
      } finally {
        await testDb.cleanup();
      }
    });

    it("skips the fallback description read for an oversized markdown file", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        // Dropped in directly (bypassing the create/save cap); listing must not
        // read the whole file just to derive a fallback description.
        const oversized = `# Big\n\n${"a".repeat(5 * 1024 * 1024 + 1)}`;
        await writeFile(service.fullPath("big.md"), oversized, "utf8");

        const items = await service.list();
        expect(items).toHaveLength(1);
        expect(items[0]?.relativePath).toBe("big.md");
        expect(items[0]?.description).toBeNull();
      } finally {
        await testDb.cleanup();
      }
    });

    it("skips files reachable through a symlinked directory", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        const outside = join(testDb.config.paths.workspaceDir, "outside-documents");
        await mkdir(outside);
        await writeFile(join(outside, "secret.md"), "Outside document root", "utf8");
        await symlink(outside, service.fullPath("linked"));

        await expect(service.list()).resolves.toEqual([]);
      } finally {
        await testDb.cleanup();
      }
    });
  });

  describe("search", () => {
    it("matches documents by title", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({ path: "architecture/arch.md", title: "Architecture Overview" });
        await service.create({ path: "notes/notes.md", title: "Meeting Notes" });

        const results = await service.search("architecture");
        expect(results).toHaveLength(1);
        expect(results[0]?.title).toBe("Architecture Overview");
      } finally {
        await testDb.cleanup();
      }
    });

    it("matches documents by path", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({ path: "design/api.md", title: "API Design" });
        await service.create({ path: "notes/notes.md", title: "Notes" });

        const results = await service.search("design");
        expect(results).toHaveLength(1);
        expect(results[0]?.relativePath).toBe("design/api.md");
      } finally {
        await testDb.cleanup();
      }
    });

    it("returns empty results for no matches", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({ path: "notes/notes.md", title: "Notes" });

        const results = await service.search("nonexistent");
        expect(results).toHaveLength(0);
      } finally {
        await testDb.cleanup();
      }
    });
  });

  describe("fallback title and description", () => {
    it("derives title from filename with dashes and underscores", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        const result = await service.create({ path: "design/my_design-doc.md" });
        expect(result.title).toBe("My Design Doc");
      } finally {
        await testDb.cleanup();
      }
    });

    it("derives description from content stripping heading", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await writeFile(
          service.fullPath("doc.md"),
          "# Title\n\nThis is the actual content of the document.",
          "utf8",
        );

        const result = await service.read("doc.md");
        expect(result.description).toBe("This is the actual content of the document.");
      } finally {
        await testDb.cleanup();
      }
    });

    it("returns null description for empty content", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await writeFile(service.fullPath("empty.md"), "", "utf8");

        const result = await service.read("empty.md");
        expect(result.description).toBeNull();
      } finally {
        await testDb.cleanup();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Boot reconciler
// ---------------------------------------------------------------------------

describe("documentReconciler", () => {
  it("discovers external markdown files and inserts DB rows", async () => {
    const testDb = await createTestDatabase();

    try {
      const docsDir = testDb.config.paths.subdirectories.documents;
      await mkdir(docsDir, { recursive: true });
      await writeFile(join(docsDir, "external.md"), "# External", "utf8");
      await mkdir(join(docsDir, "sub"), { recursive: true });
      await writeFile(join(docsDir, "sub", "nested.md"), "# Nested", "utf8");

      await documentReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      const rows = await testDb.client.db.select().from(documents);
      expect(rows).toHaveLength(2);
      const paths = rows.map((r) => r.relative_path).sort();
      expect(paths).toEqual(["external.md", "sub/nested.md"]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("removes stale rows whose files no longer exist", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      await setupDocsDir(testDb);
      await service.create({ path: "notes/notes.md" });
      await service.create({ path: "design/design.md" });

      // Remove one file from disk.
      await rm(service.fullPath("notes/notes.md"));

      await documentReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      const rows = await testDb.client.db.select().from(documents);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.relative_path).toBe("design/design.md");
    } finally {
      await testDb.cleanup();
    }
  });

  it("is idempotent — running twice yields the same rows", async () => {
    const testDb = await createTestDatabase();

    try {
      const docsDir = testDb.config.paths.subdirectories.documents;
      await mkdir(docsDir, { recursive: true });
      await writeFile(join(docsDir, "notes.md"), "# Notes", "utf8");

      await documentReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });
      await documentReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      const rows = await testDb.client.db.select().from(documents);
      expect(rows).toHaveLength(1);
    } finally {
      await testDb.cleanup();
    }
  });

  it("preserves existing metadata on re-reconcile", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      await setupDocsDir(testDb);
      await service.create({
        path: "notes/notes.md",
        title: "Custom Title",
        description: "Custom Description",
        author: "operator",
      });

      await documentReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      const rows = await testDb.client.db.select().from(documents);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.title).toBe("Custom Title");
      expect(rows[0]?.description).toBe("Custom Description");
      expect(rows[0]?.author).toBe("operator");
    } finally {
      await testDb.cleanup();
    }
  });

  it("is a no-op when the Documents folder does not exist", async () => {
    const testDb = await createTestDatabase();

    try {
      await rm(testDb.config.paths.subdirectories.documents, {
        recursive: true,
        force: true,
      });

      await documentReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      const rows = await testDb.client.db.select().from(documents);
      expect(rows).toHaveLength(0);
    } finally {
      await testDb.cleanup();
    }
  });

  it("skips hidden directories and non-markdown files", async () => {
    const testDb = await createTestDatabase();

    try {
      const docsDir = testDb.config.paths.subdirectories.documents;
      await mkdir(docsDir, { recursive: true });
      await mkdir(join(docsDir, ".hidden"), { recursive: true });
      await writeFile(join(docsDir, ".hidden", "secret.md"), "secret", "utf8");
      await writeFile(join(docsDir, "notes.txt"), "not markdown", "utf8");
      await writeFile(join(docsDir, "readme.md"), "# Readme", "utf8");

      await documentReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      const rows = await testDb.client.db.select().from(documents);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.relative_path).toBe("readme.md");
    } finally {
      await testDb.cleanup();
    }
  });

  it("handles an empty Documents folder", async () => {
    const testDb = await createTestDatabase();

    try {
      await mkdir(testDb.config.paths.subdirectories.documents, { recursive: true });

      await documentReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      const rows = await testDb.client.db.select().from(documents);
      expect(rows).toHaveLength(0);
    } finally {
      await testDb.cleanup();
    }
  });

  it("indexes existing private document roots without creating missing private roots", async () => {
    const testDb = await createTestDatabase();

    try {
      const plannerId = await insertSpecialist(testDb, { slug: "planner", name: "Planner" });
      await insertSpecialist(testDb, { slug: "researcher", name: "Researcher" });
      const plannerRoot = join(
        testDb.config.paths.workspaceDir,
        "specialists",
        "planner",
        "Documents",
      );
      const researcherRoot = join(
        testDb.config.paths.workspaceDir,
        "specialists",
        "researcher",
        "Documents",
      );
      await mkdir(join(plannerRoot, "notes"), { recursive: true });
      await writeFile(join(plannerRoot, "notes", "research.md"), "# Research", "utf8");

      await documentReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      const rows = await testDb.client.db.select().from(documents);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        scope: "private",
        owner_slug: "planner",
        owner_specialist_id: plannerId,
        relative_path: "notes/research.md",
      });
      await expect(stat(researcherRoot)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await testDb.cleanup();
    }
  });

  it("cleans stale private rows without deleting matching global rows", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      await setupDocsDir(testDb);
      const ownerSpecialistId = await insertSpecialist(testDb, { slug: "planner" });
      await service.create({ path: "notes/shared.md", title: "Global" });
      const privateDocument = await service.create({
        scope: "private",
        ownerSpecialistId,
        path: "notes/shared.md",
        title: "Private",
      });
      await rm(privateDocument.fullPath);

      await documentReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      const rows = await testDb.client.db.select().from(documents);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        scope: "global",
        relative_path: "notes/shared.md",
      });
    } finally {
      await testDb.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// move
// ---------------------------------------------------------------------------

describe("document service move", () => {
  it("renames the file and carries the metadata row (same id) to the new path", async () => {
    const testDb = await createTestDatabase();
    try {
      await setupDocsDir(testDb);
      const service = makeService(testDb);
      const docsRoot = testDb.config.paths.subdirectories.documents;

      await service.create({ path: "drafts/plan.md", title: "The Plan", content: "body" });
      const [before] = await testDb.client.db.select().from(documents);

      const moved = await service.move({
        fromPath: "drafts/plan.md",
        toPath: "final/2026/plan.md",
      });
      expect(moved.relativePath).toBe("final/2026/plan.md");

      // File moved (destination folders auto-created), source gone.
      expect(await readFile(join(docsRoot, "final/2026/plan.md"), "utf8")).toBe("body");
      await expect(stat(join(docsRoot, "drafts/plan.md"))).rejects.toThrow();

      // Same DB row carried over — id and metadata preserved, not recreated.
      const rows = await testDb.client.db.select().from(documents);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: before?.id,
        relative_path: "final/2026/plan.md",
        title: "The Plan",
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("rolls the file back to its original path when the metadata write fails", async () => {
    const testDb = await createTestDatabase();
    try {
      await setupDocsDir(testDb);
      const docsRoot = testDb.config.paths.subdirectories.documents;

      // Seed the document (and its DB row) with the real service.
      await makeService(testDb).create({
        path: "drafts/plan.md",
        title: "The Plan",
        content: "body",
      });
      const [before] = await testDb.client.db.select().from(documents);

      // A service whose metadata update throws, to simulate a DB failure after
      // the file has already been renamed on disk.
      const failingDb = new Proxy(testDb.client.db, {
        get(target, prop, receiver) {
          if (prop === "update") {
            return () => {
              throw new Error("db boom");
            };
          }
          return Reflect.get(target, prop, receiver) as unknown;
        },
      });
      const failingService = createDocumentService({
        db: failingDb as never,
        config: testDb.config,
      });

      await expect(
        failingService.move({ fromPath: "drafts/plan.md", toPath: "final/plan.md" }),
      ).rejects.toThrow("db boom");

      // File rolled back to the source; destination was not left behind.
      expect(await readFile(join(docsRoot, "drafts/plan.md"), "utf8")).toBe("body");
      await expect(stat(join(docsRoot, "final/plan.md"))).rejects.toThrow();

      // DB row is untouched — still points at the original path.
      const rows = await testDb.client.db.select().from(documents);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: before?.id, relative_path: "drafts/plan.md" });
    } finally {
      await testDb.cleanup();
    }
  });
});
