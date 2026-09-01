import { access, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createChatUploadService } from "../../src/services/chat-upload-service";
import { createTestDatabase } from "../helpers/db";

const OWNER = { agentId: "agent-1", conversationId: "conversation-1" };

describe("createChatUploadService", () => {
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
