import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { documents } from "../../src/db/schema/index";
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
          path: "notes.md",
          title: "My Notes",
          description: "Some notes",
          author: "operator",
        });

        expect(result.relativePath).toBe("notes.md");
        expect(result.title).toBe("My Notes");
        expect(result.author).toBe("operator");

        const content = await readFile(service.fullPath("notes.md"), "utf8");
        expect(content).toBe("");

        const rows = await testDb.client.db.select().from(documents);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.relative_path).toBe("notes.md");
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
          path: "design.md",
          content: "# Design\n\nArchitecture overview.",
        });

        const content = await readFile(service.fullPath("design.md"), "utf8");
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

    it("rejects duplicate documents", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({ path: "notes.md" });
        await expect(service.create({ path: "notes.md" })).rejects.toThrow("already exists");
      } finally {
        await testDb.cleanup();
      }
    });

    it("derives title from filename when title is not provided", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        const result = await service.create({ path: "my-design-doc.md" });
        expect(result.title).toBe("My Design Doc");
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

    it("rejects non-markdown extensions", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await expect(service.create({ path: "notes.txt" })).rejects.toThrow(".md");
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
        await expect(service.create({ path: "big.md", content: oversized })).rejects.toThrow(
          "exceeds the maximum allowed size",
        );
        await expect(stat(service.fullPath("big.md"))).rejects.toMatchObject({ code: "ENOENT" });
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
          path: "notes.md",
          title: "My Notes",
          description: "Test notes",
          content: "# Hello\n\nWorld",
        });

        const result = await service.read("notes.md");
        expect(result.relativePath).toBe("notes.md");
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
  });

  describe("saveContent", () => {
    it("saves content and returns updated revision", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({ path: "notes.md", content: "old" });
        const doc = await service.read("notes.md");

        const result = await service.saveContent({
          path: "notes.md",
          content: "new content",
          expectedRevision: doc.revision,
        });

        expect(result.revision.sizeBytes).toBe(11);
        const content = await readFile(service.fullPath("notes.md"), "utf8");
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
        await service.create({ path: "notes.md", content: "original" });
        const doc = await service.read("notes.md");

        // Simulate external modification.
        await writeFile(service.fullPath("notes.md"), "modified externally", "utf8");

        await expect(
          service.saveContent({
            path: "notes.md",
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
        await service.create({ path: "notes.md", content: "original" });
        const doc = await service.read("notes.md");

        const oversized = "a".repeat(5 * 1024 * 1024 + 1);
        await expect(
          service.saveContent({
            path: "notes.md",
            content: oversized,
            expectedRevision: doc.revision,
          }),
        ).rejects.toThrow("exceeds the maximum allowed size");

        const content = await readFile(service.fullPath("notes.md"), "utf8");
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
        await service.create({ path: "notes.md", title: "Old Title" });

        const result = await service.updateMetadata({
          path: "notes.md",
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
        await service.create({ path: "readme.md", title: "Readme" });

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
        await service.create({ path: "notes.md", title: "Notes" });
        await service.create({ path: "design/overview.md" });

        const items = await service.list();
        expect(items).toHaveLength(2);
        const paths = items.map((i) => i.relativePath);
        expect(paths).toContain("notes.md");
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
  });

  describe("search", () => {
    it("matches documents by title", async () => {
      const testDb = await createTestDatabase();
      const service = makeService(testDb);

      try {
        await setupDocsDir(testDb);
        await service.create({ path: "arch.md", title: "Architecture Overview" });
        await service.create({ path: "notes.md", title: "Meeting Notes" });

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
        await service.create({ path: "notes.md", title: "Notes" });

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
        await service.create({ path: "notes.md", title: "Notes" });

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
        const result = await service.create({ path: "my_design-doc.md" });
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
      await service.create({ path: "notes.md" });
      await service.create({ path: "design.md" });

      // Remove one file from disk.
      await rm(service.fullPath("notes.md"));

      await documentReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      const rows = await testDb.client.db.select().from(documents);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.relative_path).toBe("design.md");
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
        path: "notes.md",
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
});
