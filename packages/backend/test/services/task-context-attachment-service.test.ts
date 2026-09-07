import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { AppDb } from "../../src/db/client";
import { agents } from "../../src/db/schema/index";
import { createTaskContextAttachmentService } from "../../src/services/task-context-attachment-service";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";

const HELLO_DATA_URL = "data:text/plain;base64,aGVsbG8=";
const MARKDOWN_DATA_URL = "data:text/markdown;base64,IyBOb3Rlcw==";

describe("createTaskContextAttachmentService", () => {
  it("stores new attachments under the session archive task folder", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const service = createTaskContextAttachmentService({ config: testDb.config, taskService });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({ agentId: agent.id, title: "Ship release" });

      const { attachment } = await service.upload(task.id, {
        filename: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
        dataUrl: HELLO_DATA_URL,
      });

      expect(attachment.storageKey).toBe(
        `specialists/${agent.id}/tasks/${task.id}/context-attachments/${attachment.id}.txt`,
      );

      const absolutePath = resolve(
        testDb.config.paths.subdirectories.sessions,
        attachment.storageKey,
      );
      await expect(access(absolutePath)).resolves.toBeUndefined();
      await expect(readFile(absolutePath, "utf8")).resolves.toBe("hello");
    } finally {
      await testDb.cleanup();
    }
  });

  it("preserves the canonical Markdown MIME type in task metadata", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const service = createTaskContextAttachmentService({ config: testDb.config, taskService });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({ agentId: agent.id, title: "Review notes" });

      const { attachment } = await service.upload(task.id, {
        filename: "notes.md",
        mimeType: "text/markdown",
        sizeBytes: 7,
        dataUrl: MARKDOWN_DATA_URL,
      });

      expect(attachment.mimeType).toBe("text/markdown");
    } finally {
      await testDb.cleanup();
    }
  });

  it("derives the stored MIME type from the extension instead of trusting the caller", async () => {
    await withService(async ({ service, taskId }) => {
      const { attachment } = await service.upload(taskId, {
        filename: "notes.md",
        // External MCP clients routinely mislabel Markdown; the extension wins.
        mimeType: "application/octet-stream",
        sizeBytes: 7,
        dataUrl: MARKDOWN_DATA_URL,
      });

      expect(attachment.mimeType).toBe("text/markdown");
    });
  });

  it("treats sizeBytes as advisory and records the decoded length", async () => {
    await withService(async ({ service, taskId }) => {
      const { attachment } = await service.upload(taskId, {
        filename: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 999,
        dataUrl: HELLO_DATA_URL,
      });

      expect(attachment.sizeBytes).toBe(5);
    });
  });

  it("accepts the widened set of text formats", async () => {
    await withService(async ({ service, taskId }) => {
      const { attachment } = await service.upload(taskId, {
        filename: "server.log",
        mimeType: "",
        sizeBytes: 5,
        dataUrl: HELLO_DATA_URL,
      });

      expect(attachment.mimeType).toBe("text/plain");
    });
  });

  it("stores a real PNG", async () => {
    await withService(async ({ service, taskId }) => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
      const { attachment } = await service.upload(taskId, {
        filename: "logo.png",
        mimeType: "image/png",
        sizeBytes: png.byteLength,
        dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      });

      expect(attachment.mimeType).toBe("image/png");
    });
  });

  it("rejects a binary payload disguised with an image extension", async () => {
    await withService(async ({ service, taskId }) => {
      // ELF header renamed to logo.png — the extension allowlist alone would
      // have written it to the workspace.
      const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);

      await expect(
        service.upload(taskId, {
          filename: "logo.png",
          mimeType: "image/png",
          sizeBytes: elf.byteLength,
          dataUrl: `data:image/png;base64,${elf.toString("base64")}`,
        }),
      ).rejects.toThrow(/does not match/i);
    });
  });

  it("rejects binary content behind a text extension", async () => {
    await withService(async ({ service, taskId }) => {
      const binary = Buffer.from([0x68, 0x00, 0x69, 0xff]);

      await expect(
        service.upload(taskId, {
          filename: "notes.md",
          mimeType: "text/markdown",
          sizeBytes: binary.byteLength,
          dataUrl: `data:text/markdown;base64,${binary.toString("base64")}`,
        }),
      ).rejects.toThrow(/does not match/i);
    });
  });

  it.each(["payload.sh", "archive.zip", "app.exe", "lib.so", "notes"])(
    "refuses to write %s to the workspace",
    async (filename) => {
      await withService(async ({ service, taskId }) => {
        await expect(
          service.upload(taskId, {
            filename,
            mimeType: "text/plain",
            sizeBytes: 5,
            dataUrl: HELLO_DATA_URL,
          }),
        ).rejects.toThrow(/not allowed/i);
      });
    },
  );

  it.each(["../evil.md", "notes\u0000.md", "sub/dir/notes.md", "sub\\dir\\notes.md"])(
    "rejects the unsafe filename %j",
    async (filename) => {
      await withService(async ({ service, taskId }) => {
        await expect(
          service.upload(taskId, {
            filename,
            mimeType: "text/markdown",
            sizeBytes: 7,
            dataUrl: MARKDOWN_DATA_URL,
          }),
        ).rejects.toThrow(/invalid/i);
      });
    },
  );

  it("rejects an empty attachment", async () => {
    await withService(async ({ service, taskId }) => {
      await expect(
        service.upload(taskId, {
          filename: "notes.txt",
          mimeType: "text/plain",
          sizeBytes: 0,
          dataUrl: "data:text/plain;base64,",
        }),
      ).rejects.toThrow(/empty/i);
    });
  });

  it("rejects a malformed base64 payload", async () => {
    await withService(async ({ service, taskId }) => {
      await expect(
        service.upload(taskId, {
          filename: "notes.txt",
          mimeType: "text/plain",
          sizeBytes: 5,
          dataUrl: "data:text/plain;base64,not*valid*base64",
        }),
      ).rejects.toThrow(/data URL is invalid/i);
    });
  });

  it("reads attachments using only the new storage key layout", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const service = createTaskContextAttachmentService({ config: testDb.config, taskService });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({ agentId: agent.id, title: "Ship release" });
      const { attachment, context } = await service.upload(task.id, {
        filename: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
        dataUrl: HELLO_DATA_URL,
      });

      const read = await service.readConversationAttachments(context);
      expect(read).toHaveLength(1);
      expect(read[0]).toMatchObject({ id: attachment.id, filename: "notes.txt" });

      await expect(
        service.readConversationAttachments({
          attachments: [{ ...attachment, storageKey: "legacy-task/old-attachment.txt" }],
        }),
      ).rejects.toThrow();
    } finally {
      await testDb.cleanup();
    }
  });

  it("removes the task context-attachment folder", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const service = createTaskContextAttachmentService({ config: testDb.config, taskService });

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({ agentId: agent.id, title: "Ship release" });
      const { attachment, context } = await service.upload(task.id, {
        filename: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
        dataUrl: HELLO_DATA_URL,
      });
      const absolutePath = resolve(
        testDb.config.paths.subdirectories.sessions,
        attachment.storageKey,
      );

      await service.removeForTask({ ...task, context });

      await expect(access(absolutePath)).rejects.toThrow();
    } finally {
      await testDb.cleanup();
    }
  });
});

async function withService(
  run: (context: {
    service: ReturnType<typeof createTaskContextAttachmentService>;
    taskId: string;
  }) => Promise<void>,
): Promise<void> {
  const testDb = await createTestDatabase();
  const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
  const service = createTaskContextAttachmentService({ config: testDb.config, taskService });

  try {
    const agent = await insertAgent(testDb.client.db);
    const task = await taskService.create({ agentId: agent.id, title: "Ship release" });
    await run({ service, taskId: task.id });
  } finally {
    await testDb.cleanup();
  }
}

async function insertAgent(db: AppDb): Promise<typeof agents.$inferSelect> {
  const timestamp = new Date();
  const id = `agent-${crypto.randomUUID()}`;
  const [agent] = await db
    .insert(agents)
    .values({
      id,
      slug: id,
      name: "Task Specialist",
      role: "help with tasks",
      instructions: "Be useful.",
      default_model: "openai/gpt-4.1",
      icon_path: null,
      status: "active",
      capabilities_json: "{}",
      created_at: timestamp,
      updated_at: timestamp,
      archived_at: null,
    })
    .returning();

  if (!agent) {
    throw new Error("Failed to insert test agent.");
  }

  return agent;
}
