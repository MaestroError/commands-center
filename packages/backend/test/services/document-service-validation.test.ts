import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { BadRequestError, ConflictError, NotFoundError } from "../../src/lib/api-error";
import { createDocumentService } from "../../src/services/document-service";
import { createTestDatabase } from "../helpers/db";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) {
    await disposers.pop()?.();
  }
});

async function setup() {
  const testDb = await createTestDatabase();
  disposers.push(() => testDb.cleanup());
  const service = createDocumentService({ db: testDb.client.db, config: testDb.config });
  await mkdir(testDb.config.paths.subdirectories.documents, { recursive: true });
  return { testDb, service, docsRoot: testDb.config.paths.subdirectories.documents };
}

describe("document-service validation", () => {
  it("rejects invalid document paths", async () => {
    const { service } = await setup();
    const bad: Array<[string, string]> = [
      ["/abs/doc.md", "relative"],
      ["a\\b.md", "backslashes"],
      ["../escape.md", "'..'"],
      ["folder/.hidden.md", "hidden"],
      ["folder/notes.txt", ".md"],
    ];
    for (const [path] of bad) {
      await expect(service.create({ path })).rejects.toBeInstanceOf(BadRequestError);
    }
    // Root-level document without a subfolder is rejected.
    await expect(service.create({ path: "toplevel.md" })).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects oversized content and duplicate documents", async () => {
    const { service, docsRoot } = await setup();
    await service.create({ path: "notes/first.md", content: "hello" });
    await expect(service.create({ path: "notes/first.md" })).rejects.toBeInstanceOf(ConflictError);

    await mkdir(join(docsRoot, "big"), { recursive: true });
    const huge = "x".repeat(6 * 1024 * 1024);
    await expect(service.create({ path: "big/huge.md", content: huge })).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it("raises NotFound when reading, saving, or updating a missing document", async () => {
    const { service } = await setup();
    await expect(service.read("missing/doc.md")).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.saveContent({
        path: "missing/doc.md",
        content: "x",
        expectedRevision: { mtimeMs: 1, sizeBytes: 1 },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.updateMetadata({ path: "missing/doc.md", title: "T" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("detects a stale revision conflict on save", async () => {
    const { service } = await setup();
    await service.create({ path: "notes/edit.md", content: "v1" });
    await expect(
      service.saveContent({
        path: "notes/edit.md",
        content: "v2",
        expectedRevision: { mtimeMs: 1, sizeBytes: 999 },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("saves content and updates metadata on an existing document", async () => {
    const { service } = await setup();
    await service.create({ path: "notes/live.md", content: "start" });
    const read = await service.read("notes/live.md");

    const saved = await service.saveContent({
      path: "notes/live.md",
      content: "updated body",
      expectedRevision: read.revision,
    });
    expect(saved.revision.sizeBytes).toBe("updated body".length);

    const meta = await service.updateMetadata({
      path: "notes/live.md",
      title: "Live doc",
      description: "desc",
      author: "me",
    });
    expect(meta.title).toBe("Live doc");
  });

  it("lists, trees, searches, and reads documents", async () => {
    const { service } = await setup();
    await service.createFolder("guides");
    await service.create({ path: "guides/intro.md", content: "# Intro\nWelcome text." });
    await service.create({ path: "guides/advanced.md", content: "# Advanced\nDeep dive." });

    const tree = await service.getTree();
    expect(tree.length).toBeGreaterThan(0);

    const list = await service.list();
    expect(list.map((d) => d.relativePath)).toEqual(
      expect.arrayContaining(["guides/intro.md", "guides/advanced.md"]),
    );

    const read = await service.read("guides/intro.md");
    expect(read.content).toContain("Welcome text");

    const results = await service.search("advanced");
    expect(results.some((d) => d.relativePath === "guides/advanced.md")).toBe(true);
  });

  it("imports a document that exists on disk but not in the index", async () => {
    const { service, docsRoot } = await setup();
    await mkdir(join(docsRoot, "external"), { recursive: true });
    await writeFile(join(docsRoot, "external", "orphan.md"), "# Orphan\nStandalone.", "utf8");

    await service.upsertFromFilesystem("external/orphan.md");
    const list = await service.list();
    expect(list.some((d) => d.relativePath === "external/orphan.md")).toBe(true);
  });

  it("guards workspace asset resolution against escapes and missing files", async () => {
    const { service, testDb } = await setup();
    await expect(service.resolveWorkspaceAsset("../../etc/passwd")).rejects.toBeInstanceOf(
      BadRequestError,
    );
    await expect(service.resolveWorkspaceAsset("assets/missing.png")).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const assetDir = join(testDb.config.paths.workspaceDir, "assets");
    await mkdir(assetDir, { recursive: true });
    await writeFile(join(assetDir, "logo.txt"), "logo", "utf8");
    const resolved = await service.resolveWorkspaceAsset("assets/logo.txt");
    expect(resolved.absolutePath).toContain("assets/logo.txt");
  });
});
