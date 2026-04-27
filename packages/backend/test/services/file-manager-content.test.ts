import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createFileManagerService,
  resolveFileManagerRoot,
} from "../../src/services/file-manager-service";
import { createFileManagerPreferencesService } from "../../src/services/file-manager-preferences-service";
import { createTestDatabase } from "../helpers/db";

async function setupService() {
  const testDb = await createTestDatabase();
  const service = createFileManagerService({ config: testDb.config });
  const preferences = createFileManagerPreferencesService({ config: testDb.config });
  const workspaceRoot = resolveFileManagerRoot({ kind: "workspace", config: testDb.config });
  return { testDb, service, preferences, workspaceRoot };
}

describe("file-manager-service file content", () => {
  it("reads a text file and returns revision metadata", async () => {
    const ctx = await setupService();
    try {
      await mkdir(ctx.testDb.config.paths.workspaceDir, { recursive: true });
      const filePath = join(ctx.testDb.config.paths.workspaceDir, "hello.txt");
      await writeFile(filePath, "hello world", "utf8");

      const result = await ctx.service.readFileContent(ctx.workspaceRoot, "hello.txt");

      expect(result.kind).toBe("text");
      expect(result.content).toBe("hello world");
      expect(result.revision.sizeBytes).toBe(11);
      expect(result.revision.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(result.isWritable).toBe(true);
      expect(result.mimeType).toBe("text/plain");
    } finally {
      await ctx.testDb.cleanup();
    }
  });

  it("returns binary kind with base64 for files that contain null bytes", async () => {
    const ctx = await setupService();
    try {
      const filePath = join(ctx.testDb.config.paths.workspaceDir, "image.png");
      await writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));

      const result = await ctx.service.readFileContent(ctx.workspaceRoot, "image.png");

      expect(result.kind).toBe("binary");
      expect(result.encoding).toBe("base64");
      expect(Buffer.from(result.content, "base64")).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]),
      );
      expect(result.mimeType).toBe("image/png");
    } finally {
      await ctx.testDb.cleanup();
    }
  });

  it("returns too-large kind without inline content above the editor cap", async () => {
    const ctx = await setupService();
    try {
      const filePath = join(ctx.testDb.config.paths.workspaceDir, "big.bin");
      const buffer = Buffer.alloc(2 * 1024 * 1024 + 1, 0x41);
      await writeFile(filePath, buffer);

      const result = await ctx.service.readFileContent(ctx.workspaceRoot, "big.bin");

      expect(result.kind).toBe("too-large");
      expect(result.content).toBe("");
      expect(result.revision.sizeBytes).toBe(buffer.byteLength);
    } finally {
      await ctx.testDb.cleanup();
    }
  });

  it("throws not-found when reading a missing file", async () => {
    const ctx = await setupService();
    try {
      await expect(ctx.service.readFileContent(ctx.workspaceRoot, "missing.txt")).rejects.toThrow(
        /File not found/,
      );
    } finally {
      await ctx.testDb.cleanup();
    }
  });

  it("rejects path traversal", async () => {
    const ctx = await setupService();
    try {
      await expect(
        ctx.service.readFileContent(ctx.workspaceRoot, "../../etc/passwd"),
      ).rejects.toThrow(/escapes/);
    } finally {
      await ctx.testDb.cleanup();
    }
  });
});

describe("file-manager-service writeFileContent", () => {
  it("writes content and returns updated revision when expectedRevision matches", async () => {
    const ctx = await setupService();
    try {
      const filePath = join(ctx.testDb.config.paths.workspaceDir, "doc.md");
      await writeFile(filePath, "v1", "utf8");
      const initial = await ctx.service.readFileContent(ctx.workspaceRoot, "doc.md");

      const result = await ctx.service.writeFileContent(
        ctx.workspaceRoot,
        {
          root: "workspace",
          path: "doc.md",
          content: "v2-longer",
          expectedRevision: initial.revision,
        },
        { allowHostFilesystemEdits: false },
      );

      expect(result.path).toBe("doc.md");
      expect(result.revision.sizeBytes).toBe("v2-longer".length);
      expect(await readFile(filePath, "utf8")).toBe("v2-longer");
    } finally {
      await ctx.testDb.cleanup();
    }
  });

  it("returns 409 conflict details when the file changed on disk", async () => {
    const ctx = await setupService();
    try {
      const filePath = join(ctx.testDb.config.paths.workspaceDir, "doc.md");
      await writeFile(filePath, "v1", "utf8");
      const initial = await ctx.service.readFileContent(ctx.workspaceRoot, "doc.md");

      // simulate external edit
      await new Promise((r) => setTimeout(r, 5));
      await writeFile(filePath, "external-change", "utf8");

      await expect(
        ctx.service.writeFileContent(
          ctx.workspaceRoot,
          {
            root: "workspace",
            path: "doc.md",
            content: "user-change",
            expectedRevision: initial.revision,
          },
          { allowHostFilesystemEdits: false },
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        details: expect.objectContaining({
          currentRevision: expect.objectContaining({ sizeBytes: "external-change".length }),
        }),
      });
    } finally {
      await ctx.testDb.cleanup();
    }
  });

  it("blocks host-filesystem writes unless allowHostFilesystemEdits is true", async () => {
    const ctx = await setupService();
    try {
      const filePath = join(ctx.testDb.config.paths.workspaceDir, "host.txt");
      await writeFile(filePath, "x", "utf8");
      const stats = await stat(filePath);
      const hostRoot = resolveFileManagerRoot({
        kind: "host-filesystem",
        config: ctx.testDb.config,
      });

      await expect(
        ctx.service.writeFileContent(
          hostRoot,
          {
            root: "host-filesystem",
            path: filePath,
            content: "y",
            expectedRevision: { mtimeMs: stats.mtimeMs, sizeBytes: stats.size },
          },
          { allowHostFilesystemEdits: false },
        ),
      ).rejects.toMatchObject({ statusCode: 403 });
    } finally {
      await ctx.testDb.cleanup();
    }
  });
});

describe("file-manager-preferences-service", () => {
  it("returns defaults when the preferences file does not exist", async () => {
    const ctx = await setupService();
    try {
      expect(await ctx.preferences.get()).toEqual({
        allowHostFilesystemEdits: false,
        fileUploads: {
          maxUploadSizeBytes: 50 * 1024 * 1024,
          allowDangerousFiles: false,
        },
      });
    } finally {
      await ctx.testDb.cleanup();
    }
  });

  it("persists and reads back updated preferences", async () => {
    const ctx = await setupService();
    try {
      await ctx.preferences.update({
        allowHostFilesystemEdits: true,
        fileUploads: {
          maxUploadSizeBytes: 1024,
          allowDangerousFiles: true,
        },
      });
      expect(await ctx.preferences.get()).toEqual({
        allowHostFilesystemEdits: true,
        fileUploads: {
          maxUploadSizeBytes: 1024,
          allowDangerousFiles: true,
        },
      });
    } finally {
      await ctx.testDb.cleanup();
    }
  });
});
