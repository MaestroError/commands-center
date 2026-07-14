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
