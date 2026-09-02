import * as fsPromises from "node:fs/promises";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  actualChmod: null as typeof fsPromises.chmod | null,
  actualRename: null as typeof fsPromises.rename | null,
  chmod: vi.fn<typeof fsPromises.chmod>(),
  rename: vi.fn<typeof fsPromises.rename>(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  fsMocks.actualChmod = actual.chmod;
  fsMocks.actualRename = actual.rename;
  fsMocks.chmod.mockImplementation(actual.chmod);
  fsMocks.rename.mockImplementation(actual.rename);
  return { ...actual, chmod: fsMocks.chmod, rename: fsMocks.rename };
});

import { createChatUploadService } from "../../src/services/chat-upload-service";
import { createTestDatabase } from "../helpers/db";

const OWNER = { agentId: "agent-1", conversationId: "conversation-1" };
const { access, mkdir, readFile, readdir, rm, stat, symlink, writeFile } = fsPromises;

describe("createChatUploadService", () => {
  beforeEach(() => {
    fsMocks.chmod.mockReset().mockImplementation(fsMocks.actualChmod!);
    fsMocks.rename.mockReset().mockImplementation(fsMocks.actualRename!);
  });

  it("stores distinct private files with the accepted bytes", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });

    try {
      const persisted = await service.persist({
        ...OWNER,
        attachments: [attachment("../notes.txt", "hello"), attachment("../notes.txt", "world")],
      });
      const listed = await service.list(OWNER);

      expect(listed).toHaveLength(2);
      expect(new Set(listed.map((upload) => upload.storageKey)).size).toBe(2);
      await expect(readFile(listed[0]!.absolutePath, "utf8")).resolves.toBe("world");
      await expect(readFile(listed[1]!.absolutePath, "utf8")).resolves.toBe("hello");
      expect((await stat(listed[0]!.absolutePath)).mode & 0o777).toBe(0o600);
      expect(persisted.uploads.map((upload) => upload.filename)).toEqual([
        "../notes.txt",
        "../notes.txt",
      ]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("uses an effective MIME type and safe fallback extension", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });

    try {
      await service.persist({
        ...OWNER,
        attachments: [attachment("../source.ts", "const value = 1", "text/typescript")],
      });
      const [listed] = await service.list(OWNER);

      expect(listed?.mimeType).toBe("text/plain");
      expect(listed?.storageKey).toMatch(/\.ts$/);
      expect(listed?.absolutePath).not.toContain("source.ts");
    } finally {
      await testDb.cleanup();
    }
  });

  it("does not create storage for a send without attachments", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });
    const uploadDirectory = resolve(
      testDb.config.paths.subdirectories.sessions,
      "specialists",
      OWNER.agentId,
      "chats",
      OWNER.conversationId,
      "uploads",
    );

    try {
      await service.persist({ ...OWNER, attachments: [] });
      await expect(access(uploadDirectory)).rejects.toThrow();
    } finally {
      await testDb.cleanup();
    }
  });

  it("rolls back only the uploads from the rejected send", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });

    try {
      await service.persist({ ...OWNER, attachments: [attachment("kept.txt", "kept")] });
      const rejected = await service.persist({
        ...OWNER,
        attachments: [attachment("rejected.txt", "rejected")],
      });
      const rejectedPath = (await service.list(OWNER))[0]!.absolutePath;

      await rejected.rollback();

      await expect(access(rejectedPath)).rejects.toThrow();
      await expect(service.list(OWNER)).resolves.toMatchObject([{ filename: "kept.txt" }]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("removes one conversation's uploads without affecting another chat", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });
    const other = { ...OWNER, conversationId: "conversation-2" };

    try {
      await service.persist({ ...OWNER, attachments: [attachment("first.txt", "first")] });
      await service.persist({ ...other, attachments: [attachment("second.txt", "second")] });

      await service.removeForConversation(OWNER);

      await expect(service.list(OWNER)).resolves.toEqual([]);
      await expect(service.list(other)).resolves.toMatchObject([{ filename: "second.txt" }]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects deletion through an in-root cross-chat ancestor symlink", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });
    const other = { ...OWNER, conversationId: "conversation-2" };
    const chatsDirectory = resolve(
      testDb.config.paths.subdirectories.sessions,
      "specialists",
      OWNER.agentId,
      "chats",
    );

    try {
      await service.persist({ ...other, attachments: [attachment("kept.txt", "kept")] });
      await symlink(other.conversationId, resolve(chatsDirectory, OWNER.conversationId));

      await expect(service.removeForConversation(OWNER)).rejects.toThrow(
        "Chat upload directory is invalid",
      );
      await expect(service.list(other)).resolves.toMatchObject([{ filename: "kept.txt" }]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("does not delete another chat when an ancestor changes during deletion", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });
    const other = { ...OWNER, conversationId: "conversation-2" };
    const chatsDirectory = resolve(
      testDb.config.paths.subdirectories.sessions,
      "specialists",
      OWNER.agentId,
      "chats",
    );
    const ownerDirectory = resolve(chatsDirectory, OWNER.conversationId);
    const displacedOwner = `${ownerDirectory}-displaced`;

    try {
      await service.persist({ ...OWNER, attachments: [attachment("first.txt", "first")] });
      await service.persist({ ...other, attachments: [attachment("kept.txt", "kept")] });
      fsMocks.rename.mockImplementationOnce(async (oldPath, newPath) => {
        await fsMocks.actualRename!(ownerDirectory, displacedOwner);
        await symlink(other.conversationId, ownerDirectory);
        await fsMocks.actualRename!(oldPath, newPath);
      });

      await expect(service.removeForConversation(OWNER)).rejects.toThrow("changed during deletion");
      const sessionsEntries = await readdir(testDb.config.paths.subdirectories.sessions);
      const quarantine = sessionsEntries.find((entry) => entry.endsWith(".deleting"));
      expect(quarantine).toBeDefined();
      const manifest = JSON.parse(
        await readFile(
          resolve(testDb.config.paths.subdirectories.sessions, quarantine!, "manifest.json"),
          "utf8",
        ),
      ) as { uploads: Array<{ storageKey: string }> };
      const filename = manifest.uploads[0]!.storageKey.split("/").at(-1)!;
      await expect(
        readFile(
          resolve(testDb.config.paths.subdirectories.sessions, quarantine!, filename),
          "utf8",
        ),
      ).resolves.toBe("kept");
    } finally {
      await testDb.cleanup();
    }
  });

  it("deletes the quarantined owner when its former ancestor changes", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });
    const other = { ...OWNER, conversationId: "conversation-2" };
    const chatsDirectory = resolve(
      testDb.config.paths.subdirectories.sessions,
      "specialists",
      OWNER.agentId,
      "chats",
    );
    const ownerDirectory = resolve(chatsDirectory, OWNER.conversationId);
    const displacedOwner = `${ownerDirectory}-displaced`;

    try {
      await service.persist({ ...OWNER, attachments: [attachment("first.txt", "first")] });
      await service.persist({ ...other, attachments: [attachment("kept.txt", "kept")] });
      fsMocks.rename.mockImplementationOnce(async (oldPath, newPath) => {
        await fsMocks.actualRename!(oldPath, newPath);
        await fsMocks.actualRename!(ownerDirectory, displacedOwner);
        await symlink(other.conversationId, ownerDirectory);
      });

      await expect(service.removeForConversation(OWNER)).resolves.toBeUndefined();
      await expect(service.list(other)).resolves.toMatchObject([{ filename: "kept.txt" }]);
      await expect(access(resolve(displacedOwner, "uploads"))).rejects.toThrow();
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects malformed attachment data without creating a manifest", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });

    try {
      await expect(
        service.persist({
          ...OWNER,
          attachments: [{ ...attachment("bad.txt", "bad"), dataUrl: "data:text/plain;base64,%%%" }],
        }),
      ).rejects.toThrow("Attachment data URL is invalid");
      await expect(service.list(OWNER)).resolves.toEqual([]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("fails safely when the manifest is corrupt", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });
    const uploadDirectory = resolve(
      testDb.config.paths.subdirectories.sessions,
      "specialists",
      OWNER.agentId,
      "chats",
      OWNER.conversationId,
      "uploads",
    );

    try {
      await mkdir(uploadDirectory, { recursive: true });
      await writeFile(resolve(uploadDirectory, "manifest.json"), "not-json", { mode: 0o600 });
      await expect(service.list(OWNER)).rejects.toThrow("Uploaded file metadata is invalid");
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects a symlinked manifest", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });
    const uploadDirectory = resolve(
      testDb.config.paths.subdirectories.sessions,
      "specialists",
      OWNER.agentId,
      "chats",
      OWNER.conversationId,
      "uploads",
    );
    const outsideManifest = resolve(testDb.cwd, "outside-manifest.json");

    try {
      await mkdir(uploadDirectory, { recursive: true });
      await writeFile(outsideManifest, JSON.stringify({ version: 1, uploads: [] }));
      await symlink(outsideManifest, resolve(uploadDirectory, "manifest.json"));

      await expect(service.list(OWNER)).rejects.toThrow("metadata is invalid");
    } finally {
      await testDb.cleanup();
    }
  });

  it("fails safely when a listed file is missing", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });

    try {
      await service.persist({ ...OWNER, attachments: [attachment("gone.txt", "gone")] });
      const [listed] = await service.list(OWNER);
      await rm(listed!.absolutePath);
      await expect(service.list(OWNER)).rejects.toThrow("unavailable file");
    } finally {
      await testDb.cleanup();
    }
  });

  it("fails safely when a manifest storage key escapes the owning chat", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });

    try {
      await service.persist({ ...OWNER, attachments: [attachment("safe.txt", "safe")] });
      const uploadDirectory = resolve(
        testDb.config.paths.subdirectories.sessions,
        "specialists",
        OWNER.agentId,
        "chats",
        OWNER.conversationId,
        "uploads",
      );
      const manifestPath = resolve(uploadDirectory, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        uploads: Array<{ storageKey: string }>;
      };
      manifest.uploads[0]!.storageKey =
        "specialists/agent-1/chats/conversation-2/uploads/01ESCAPE.txt";
      await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });

      await expect(service.list(OWNER)).rejects.toThrow("invalid storage key");
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects persistence before mutating a manifest with an invalid storage key", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });
    const uploadDirectory = resolve(
      testDb.config.paths.subdirectories.sessions,
      "specialists",
      OWNER.agentId,
      "chats",
      OWNER.conversationId,
      "uploads",
    );
    const manifestPath = resolve(uploadDirectory, "manifest.json");

    try {
      await service.persist({ ...OWNER, attachments: [attachment("safe.txt", "safe")] });
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        uploads: Array<{ storageKey: string }>;
      };
      manifest.uploads[0]!.storageKey =
        "specialists/agent-1/chats/conversation-2/uploads/01ESCAPE.txt";
      const corrupted = `${JSON.stringify(manifest)}\n`;
      await writeFile(manifestPath, corrupted, { mode: 0o600 });
      const entriesBefore = await readdir(uploadDirectory);

      await expect(
        service.persist({ ...OWNER, attachments: [attachment("new.txt", "new")] }),
      ).rejects.toThrow("could not be saved");

      await expect(readFile(manifestPath, "utf8")).resolves.toBe(corrupted);
      await expect(readdir(uploadDirectory)).resolves.toEqual(entriesBefore);
    } finally {
      await testDb.cleanup();
    }
  });

  it("removes a newly written file when its permission update fails", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });
    const uploadDirectory = resolve(
      testDb.config.paths.subdirectories.sessions,
      "specialists",
      OWNER.agentId,
      "chats",
      OWNER.conversationId,
      "uploads",
    );
    fsMocks.chmod.mockRejectedValueOnce(new Error("chmod failed"));

    try {
      await expect(
        service.persist({ ...OWNER, attachments: [attachment("private.txt", "private")] }),
      ).rejects.toThrow("could not be saved");
      await expect(readdir(uploadDirectory)).resolves.toEqual([]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("has no fallible permission update after the manifest rename commits", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });
    fsMocks.chmod.mockImplementation(async (...args) => {
      if (fsMocks.chmod.mock.calls.length === 3) throw new Error("post-commit chmod failed");
      await fsMocks.actualChmod!(...args);
    });

    try {
      await expect(
        service.persist({ ...OWNER, attachments: [attachment("saved.txt", "saved")] }),
      ).resolves.toBeDefined();
      await expect(service.list(OWNER)).resolves.toMatchObject([{ filename: "saved.txt" }]);
      expect(fsMocks.chmod).toHaveBeenCalledTimes(2);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects a symlinked chat directory that escapes the sessions root", async () => {
    const testDb = await createTestDatabase();
    const service = createChatUploadService({ config: testDb.config });
    const chatsDirectory = resolve(
      testDb.config.paths.subdirectories.sessions,
      "specialists",
      OWNER.agentId,
      "chats",
    );
    const outsideDirectory = resolve(testDb.cwd, "outside-chat");

    try {
      await mkdir(chatsDirectory, { recursive: true });
      await mkdir(outsideDirectory, { recursive: true });
      await symlink(outsideDirectory, resolve(chatsDirectory, OWNER.conversationId));

      await expect(
        service.persist({ ...OWNER, attachments: [attachment("safe.txt", "safe")] }),
      ).rejects.toThrow("could not be saved");
      await expect(access(resolve(outsideDirectory, "uploads"))).rejects.toThrow();
      await expect(service.list(OWNER)).resolves.toEqual([]);
    } finally {
      await testDb.cleanup();
    }
  });
});

function attachment(filename: string, content: string, mimeType = "text/plain") {
  return {
    type: "file" as const,
    filename,
    mimeType,
    sizeBytes: Buffer.byteLength(content),
    dataUrl: `data:${mimeType};base64,${Buffer.from(content).toString("base64")}`,
  };
}
