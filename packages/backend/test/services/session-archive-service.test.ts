import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ConversationMessage } from "@cc/shared/schemas";
import { describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import { createSessionArchiveService } from "../../src/services/session-archive-service";

const SPECIALIST = { id: "agent-1", slug: "writer", name: "Writer" };

async function withService(
  fn: (service: ReturnType<typeof createSessionArchiveService>) => void | Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "cc-session-archive-service-"));

  try {
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    await fn(createSessionArchiveService({ config }));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function message(overrides: Partial<ConversationMessage> & { id: string }): ConversationMessage {
  return {
    conversationId: "conv-1",
    role: "user",
    content: "hello",
    parts: [],
    attachments: [],
    createdAt: "2026-06-18T10:00:00.000Z",
    updatedAt: "2026-06-18T10:00:00.000Z",
    ...overrides,
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("createSessionArchiveService", () => {
  it("resolves chat and task-run archive paths by agentId", async () => {
    await withService((service) => {
      expect(
        service.resolveChatArchivePath({ agentId: "agent-1", conversationId: "conv-1" }),
      ).toMatch(/sessions\/specialists\/agent-1\/chats\/conv-1$/);
      expect(
        service.resolveTaskRunArchivePath({
          agentId: "agent-1",
          taskId: "task-1",
          taskRunId: "run-1",
        }),
      ).toMatch(/sessions\/specialists\/agent-1\/tasks\/task-1\/runs\/run-1$/);
    });
  });

  it("creates metadata and appends messages without duplicating ids", async () => {
    await withService(async (service) => {
      const metadata = await service.ensureChatArchive({
        specialist: SPECIALIST,
        conversationId: "conv-1",
        opencodeSessionId: "oc-1",
        title: "Greeting",
      });
      const archivePath = service.resolveChatArchivePath({
        agentId: "agent-1",
        conversationId: "conv-1",
      });

      expect(metadata.kind).toBe("chat");
      expect(metadata.messageCount).toBe(0);

      await service.appendMessages({
        archivePath,
        messages: [message({ id: "m1" }), message({ id: "m2", role: "assistant" })],
      });
      // Re-append overlapping ids; only the new one should be written.
      await service.appendMessages({
        archivePath,
        messages: [message({ id: "m2", role: "assistant" }), message({ id: "m3" })],
      });

      const jsonl = await readFile(join(archivePath, "messages.jsonl"), "utf8");
      const ids = jsonl
        .trim()
        .split("\n")
        .map((line) => (JSON.parse(line) as ConversationMessage).id);
      expect(ids).toEqual(["m1", "m2", "m3"]);

      const stored = JSON.parse(await readFile(join(archivePath, "metadata.json"), "utf8")) as {
        messageCount: number;
        lastAppendedAt: string | null;
      };
      expect(stored.messageCount).toBe(3);
      expect(stored.lastAppendedAt).not.toBeNull();
    });
  });

  it("materializes a transcript and tracks stale state across later appends", async () => {
    await withService(async (service) => {
      await service.ensureChatArchive({
        specialist: SPECIALIST,
        conversationId: "conv-1",
        opencodeSessionId: "oc-1",
      });
      const archivePath = service.resolveChatArchivePath({
        agentId: "agent-1",
        conversationId: "conv-1",
      });
      await service.appendMessages({ archivePath, messages: [message({ id: "m1" })] });

      const materialized = await service.materialize({ archivePath });
      expect(materialized?.lastMaterializedMessageCount).toBe(1);
      const transcript = await readFile(join(archivePath, "transcript.md"), "utf8");
      expect(transcript).toContain("# Session:");
      expect(transcript).toContain('<user_message id="m1"');

      // Appending after materialization makes the session stale again.
      await service.appendMessages({
        archivePath,
        messages: [message({ id: "m2", role: "assistant" })],
      });
      const stored = JSON.parse(await readFile(join(archivePath, "metadata.json"), "utf8")) as {
        messageCount: number;
        lastMaterializedMessageCount: number;
      };
      expect(stored.messageCount).toBe(2);
      expect(stored.lastMaterializedMessageCount).toBe(1);

      const due = await service.materializeDueSessions({});
      expect(due.materialized).toBe(1);
    });
  });

  it("removes an archive folder", async () => {
    await withService(async (service) => {
      await service.ensureChatArchive({
        specialist: SPECIALIST,
        conversationId: "conv-1",
        opencodeSessionId: "oc-1",
      });
      const archivePath = service.resolveChatArchivePath({
        agentId: "agent-1",
        conversationId: "conv-1",
      });
      expect(await exists(archivePath)).toBe(true);

      await service.removeArchive({ archivePath });
      expect(await exists(archivePath)).toBe(false);
    });
  });
});
