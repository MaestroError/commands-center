import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../src/lib/api-error";
import {
  createFileManagerService,
  resolveFileManagerRoot,
} from "../../src/services/file-manager-service";
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
  const service = createFileManagerService({ config: testDb.config });
  const root = resolveFileManagerRoot({ kind: "workspace", config: testDb.config });
  await mkdir(testDb.config.paths.workspaceDir, { recursive: true });
  return { testDb, service, root, dir: testDb.config.paths.workspaceDir };
}

describe("file-manager-service error paths", () => {
  it("rejects invalid and duplicate entry names on create", async () => {
    const { service, root, dir } = await setup();
    await expect(
      service.createEntry(root, { root: "workspace", parentPath: ".", name: "a/b", type: "file" }),
    ).rejects.toBeInstanceOf(BadRequestError);

    await service.createEntry(root, {
      root: "workspace",
      parentPath: ".",
      name: "notes.txt",
      type: "file",
    });
    await expect(
      service.createEntry(root, {
        root: "workspace",
        parentPath: ".",
        name: "notes.txt",
        type: "file",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    void dir;
  });

  it("forbids renaming or deleting a CommandsCenter-critical file", async () => {
    const { service, root, dir } = await setup();
    await writeFile(join(dir, "opencode.jsonc"), "{}", "utf8");

    await expect(
      service.renameEntry(root, {
        root: "workspace",
        path: "opencode.jsonc",
        name: "renamed.jsonc",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      service.deleteEntry(root, { root: "workspace", path: "opencode.jsonc" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("raises NotFound when renaming or deleting a missing entry", async () => {
    const { service, root } = await setup();
    await expect(
      service.renameEntry(root, { root: "workspace", path: "ghost.txt", name: "new.txt" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.deleteEntry(root, { root: "workspace", path: "ghost.txt" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("validates move destinations", async () => {
    const { service, root, dir } = await setup();
    await writeFile(join(dir, "file.txt"), "x", "utf8");
    await writeFile(join(dir, "target.txt"), "y", "utf8");
    await mkdir(join(dir, "folder"), { recursive: true });

    // Destination must be a directory.
    await expect(
      service.moveEntry(root, {
        root: "workspace",
        path: "file.txt",
        destinationPath: "target.txt",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    // Cannot move a folder into itself.
    await expect(
      service.moveEntry(root, { root: "workspace", path: "folder", destinationPath: "folder" }),
    ).rejects.toBeInstanceOf(BadRequestError);

    // A valid move succeeds.
    const moved = await service.moveEntry(root, {
      root: "workspace",
      path: "file.txt",
      destinationPath: "folder",
    });
    expect(moved).toBe("folder/file.txt");
  });

  it("guards file reads: missing file and non-file targets", async () => {
    const { service, root, dir } = await setup();
    await mkdir(join(dir, "sub"), { recursive: true });

    await expect(service.readFileContent(root, "nope.txt")).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.readFileContent(root, "sub")).rejects.toBeInstanceOf(BadRequestError);
  });

  it("detects a stale revision conflict on write", async () => {
    const { service, root, dir } = await setup();
    await writeFile(join(dir, "doc.txt"), "original", "utf8");

    await expect(
      service.writeFileContent(
        root,
        {
          root: "workspace",
          path: "doc.txt",
          content: "changed",
          expectedRevision: { mtimeMs: 1, sizeBytes: 999, sha256: "deadbeef" },
        },
        { allowHostFilesystemEdits: false },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("creates a directory entry, writes content on a matching revision, and uploads files", async () => {
    const { service, root, dir } = await setup();

    const folder = await service.createEntry(root, {
      root: "workspace",
      parentPath: ".",
      name: "uploads",
      type: "directory",
    });
    expect(folder).toBe("uploads");

    await writeFile(join(dir, "doc.txt"), "start", "utf8");
    const read = await service.readFileContent(root, "doc.txt");
    const saved = await service.writeFileContent(
      root,
      { root: "workspace", path: "doc.txt", content: "updated", expectedRevision: read.revision },
      { allowHostFilesystemEdits: false },
    );
    expect(saved.revision.sizeBytes).toBe("updated".length);

    const uploadResult = await service.uploadEntries(
      root,
      {
        root: "workspace",
        destinationPath: "uploads",
        entries: [
          {
            name: "note.txt",
            relativePath: "note.txt",
            contentBase64: Buffer.from("hello", "utf8").toString("base64"),
            sizeBytes: 5,
          },
        ],
      },
      { allowHostFilesystemEdits: false, maxUploadSizeBytes: 1024, allowDangerousFiles: true },
    );
    expect(uploadResult.uploaded).toHaveLength(1);
  });

  it("lists directories and searches by name with exclusions", async () => {
    const { service, root, dir } = await setup();
    await mkdir(join(dir, "alpha"), { recursive: true });
    await mkdir(join(dir, "beta"), { recursive: true });
    await mkdir(join(dir, "alpha", "nested"), { recursive: true });

    const listing = await service.listDirectory(root, { path: "." });
    expect(listing.nodes.map((n) => n.name)).toEqual(expect.arrayContaining(["alpha", "beta"]));

    const matches = await service.searchDirectories(root, { query: "alpha" });
    expect(matches).toContain("alpha");

    const excluded = await service.searchDirectories(root, { excludePath: "alpha" });
    expect(excluded).not.toContain("alpha");
    expect(excluded).toContain("beta");
  });
});
