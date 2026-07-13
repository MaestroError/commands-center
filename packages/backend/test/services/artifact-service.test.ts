import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AppDb } from "../../src/db/client";
import { agents, artifact_share_links, conversations } from "../../src/db/schema/index";
import { BadRequestError, NotFoundError } from "../../src/lib/api-error";
import { createArtifactService } from "../../src/services/artifact-service";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";

async function insertAgent(db: AppDb): Promise<string> {
  const id = `agent-${randomUUID()}`;
  const timestamp = new Date();
  await db.insert(agents).values({
    id,
    slug: id,
    name: "Artifact Specialist",
    role: "produce artifacts",
    instructions: "Be useful.",
    default_model: "openai/gpt-4.1",
    icon_path: null,
    status: "active",
    capabilities_json: "{}",
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: null,
  });
  return id;
}

async function insertConversation(
  db: AppDb,
  agentId: string,
  options: { runId?: string } = {},
): Promise<string> {
  const id = `conv-${randomUUID()}`;
  const timestamp = new Date();
  await db.insert(conversations).values({
    id,
    agent_id: agentId,
    opencode_session_id: `session-${id}`,
    title: null,
    status: "active",
    source: options.runId ? "task_run" : "chat",
    is_current: false,
    task_run_id: options.runId ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  });
  return id;
}

async function setup() {
  const testDb = await createTestDatabase();
  const service = createArtifactService({ db: testDb.client.db, config: testDb.config });
  return { testDb, service };
}

describe("createArtifactService", () => {
  it("creates and lists artifacts by conversation ordered by newest first", async () => {
    const { testDb, service } = await setup();
    try {
      const agentId = await insertAgent(testDb.client.db);
      const conversationId = await insertConversation(testDb.client.db, agentId);

      const first = await service.create({
        conversationId,
        title: "First",
        type: "url",
        link: "https://example.com/1",
      });
      const second = await service.create({
        conversationId,
        title: "Second",
        description: "with desc",
        type: "url",
        link: "https://example.com/2",
      });

      const listed = await service.listByConversation(conversationId);
      expect(listed.map((a) => a.id)).toEqual([second.id, first.id]);
      expect(listed[0]?.description).toBe("with desc");
      expect(listed[0]?.shareLinks).toEqual([]);

      const fetched = await service.getArtifact(first.id);
      expect(fetched?.title).toBe("First");
      expect(await service.getArtifact("missing")).toBeUndefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("batches task-run artifacts keyed by run id and ignores empty input", async () => {
    const { testDb, service } = await setup();
    try {
      const agentId = await insertAgent(testDb.client.db);
      const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
      const task = await taskService.create({ agentId, title: "Run task" });
      const run = await taskService.createRun({
        taskId: task.id,
        agentId,
        status: "running",
        triggerSource: "manual",
        renderedPrompt: "Run.",
      });
      const runId = run.id;
      const conversationId = await insertConversation(testDb.client.db, agentId, { runId });
      const created = await service.create({
        conversationId,
        title: "Run artifact",
        type: "url",
        link: "https://example.com/run",
      });

      expect(await service.listByTaskRunIds([])).toEqual(new Map());

      const grouped = await service.listByTaskRunIds([runId, "unknown-run"]);
      expect(grouped.get(runId)?.map((a) => a.id)).toEqual([created.id]);
      expect(grouped.has("unknown-run")).toBe(false);
    } finally {
      await testDb.cleanup();
    }
  });

  it("opens and publishes Windows-style artifact paths from the specialist Documents folder", async () => {
    const { testDb, service } = await setup();
    try {
      const agentId = await insertAgent(testDb.client.db);
      const conversationId = await insertConversation(testDb.client.db, agentId);
      const absolute = join(
        testDb.config.paths.subdirectories.specialists,
        agentId,
        "Documents",
        "references",
        "tool-list.md",
      );
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, "tool list", "utf8");

      const artifact = await service.create({
        conversationId,
        title: "Complete Tool List",
        type: "file",
        link: "references\\tool-list.md",
      });

      expect(artifact.fileManagerPath).toBe(
        `specialists/${agentId}/Documents/references/tool-list.md`,
      );

      const [listed] = await service.listByConversation(conversationId);
      expect(listed?.fileManagerPath).toBe(
        `specialists/${agentId}/Documents/references/tool-list.md`,
      );

      const published = await service.publishArtifact(artifact.id);
      expect(published.originalFilename).toBe("tool-list.md");
      await expect(
        readFile(service.resolveArtifactPath(published.storageKey!), "utf8"),
      ).resolves.toBe("tool list");
    } finally {
      await testDb.cleanup();
    }
  });

  it("records a private-scope document artifact and publishes it from the owner's Documents", async () => {
    const { testDb, service } = await setup();
    try {
      const agentId = await insertAgent(testDb.client.db);
      const conversationId = await insertConversation(testDb.client.db, agentId);
      const relativePath = "Reports/2026-07-13/report.md";
      const absolute = join(
        testDb.config.paths.subdirectories.specialists,
        agentId,
        "Documents",
        relativePath,
      );
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, "private report", "utf8");

      const artifact = await service.create({
        conversationId,
        title: "Private report",
        type: "document",
        link: relativePath,
      });

      expect(artifact.documentScope).toBe("private");
      expect(artifact.documentOwnerSlug).toBe(agentId);

      const published = await service.publishArtifact(artifact.id);
      expect(published.originalFilename).toBe("report.md");
      await expect(
        readFile(service.resolveArtifactPath(published.storageKey!), "utf8"),
      ).resolves.toBe("private report");
    } finally {
      await testDb.cleanup();
    }
  });

  it("treats a document only in the shared Documents module as global scope", async () => {
    const { testDb, service } = await setup();
    try {
      const agentId = await insertAgent(testDb.client.db);
      const conversationId = await insertConversation(testDb.client.db, agentId);
      const relativePath = "Reports/2026-07-13/report.md";
      const absolute = join(testDb.config.paths.subdirectories.documents, relativePath);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, "shared report", "utf8");

      const artifact = await service.create({
        conversationId,
        title: "Shared report",
        type: "document",
        link: relativePath,
      });

      expect(artifact.documentScope ?? "global").toBe("global");
      expect(artifact.documentOwnerSlug ?? null).toBeNull();

      const published = await service.publishArtifact(artifact.id);
      await expect(
        readFile(service.resolveArtifactPath(published.storageKey!), "utf8"),
      ).resolves.toBe("shared report");
    } finally {
      await testDb.cleanup();
    }
  });

  it("publishes a file artifact, is idempotent, and resolves the registered file", async () => {
    const { testDb, service } = await setup();
    try {
      const agentId = await insertAgent(testDb.client.db);
      const conversationId = await insertConversation(testDb.client.db, agentId);
      const artifact = await service.create({
        conversationId,
        title: "Report",
        type: "file",
        link: "reports/release.md",
      });

      const absolute = join(testDb.config.paths.workspaceDir, "reports/release.md");
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, "release notes", "utf8");

      const published = await service.publishArtifact(artifact.id);
      expect(published.originalFilename).toBe("release.md");
      expect(published.mimeType).toBe("text/markdown");
      expect(published.sizeBytes).toBe("release notes".length);
      expect(published.storageKey).toBe(`artifacts/${artifact.id}/release.md`);

      // Idempotent: re-publish returns the existing manifest entry.
      const republished = await service.publishArtifact(artifact.id);
      expect(republished.checksum).toBe(published.checksum);

      const registered = await service.getRegisteredArtifact(artifact.id);
      expect(registered?.storageKey).toBe(published.storageKey);

      const storagePath = service.resolveArtifactPath(published.storageKey!);
      expect(storagePath).toContain(published.storageKey);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects publishing non-file artifacts and unknown artifacts", async () => {
    const { testDb, service } = await setup();
    try {
      const agentId = await insertAgent(testDb.client.db);
      const conversationId = await insertConversation(testDb.client.db, agentId);
      const link = await service.create({
        conversationId,
        title: "Link",
        type: "url",
        link: "https://example.com",
      });

      await expect(service.publishArtifact(link.id)).rejects.toBeInstanceOf(BadRequestError);
      await expect(service.publishArtifact("nope")).rejects.toBeInstanceOf(NotFoundError);
      expect(await service.getRegisteredArtifact(link.id)).toBeUndefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns undefined when a file artifact was never published", async () => {
    const { testDb, service } = await setup();
    try {
      const agentId = await insertAgent(testDb.client.db);
      const conversationId = await insertConversation(testDb.client.db, agentId);
      const artifact = await service.create({
        conversationId,
        title: "Unpublished",
        type: "file",
        link: "reports/unpublished.md",
      });

      expect(await service.getRegisteredArtifact(artifact.id)).toBeUndefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("raises NotFoundError when the source file is missing", async () => {
    const { testDb, service } = await setup();
    try {
      const agentId = await insertAgent(testDb.client.db);
      const conversationId = await insertConversation(testDb.client.db, agentId);
      const artifact = await service.create({
        conversationId,
        title: "Ghost",
        type: "file",
        link: "reports/ghost.md",
      });

      await expect(service.publishArtifact(artifact.id)).rejects.toBeInstanceOf(NotFoundError);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects path-traversal and absolute artifact links", async () => {
    const { testDb, service } = await setup();
    try {
      const agentId = await insertAgent(testDb.client.db);
      const conversationId = await insertConversation(testDb.client.db, agentId);

      for (const link of [
        "../escape.md",
        "/etc/passwd",
        "\\\\server\\share\\file.md",
        "C:\\escape.md",
        "C:/escape.md",
        "..",
        ".",
      ]) {
        const artifact = await service.create({
          conversationId,
          title: "Traversal",
          type: "file",
          link,
        });
        await expect(service.publishArtifact(artifact.id)).rejects.toBeInstanceOf(BadRequestError);
      }
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects malformed storage keys", async () => {
    const { testDb, service } = await setup();
    try {
      expect(() => service.resolveArtifactPath("bad-key")).toThrow(BadRequestError);
      expect(() => service.resolveArtifactPath("artifacts/../secret")).toThrow(BadRequestError);
      expect(() => service.resolveArtifactPath("wrong/a/b")).toThrow(BadRequestError);
    } finally {
      await testDb.cleanup();
    }
  });

  it("maps active share links onto listed artifacts and ignores revoked ones", async () => {
    const { testDb, service } = await setup();
    try {
      const agentId = await insertAgent(testDb.client.db);
      const conversationId = await insertConversation(testDb.client.db, agentId);
      const artifact = await service.create({
        conversationId,
        title: "Shared",
        type: "file",
        link: "reports/shared.md",
      });

      const now = new Date();
      await testDb.client.db.insert(artifact_share_links).values([
        {
          id: "link-active",
          artifact_id: artifact.id,
          token_hash: "hash-active",
          token_prefix: "abcd1234",
          created_at: now,
          expires_at: new Date(now.getTime() + 3_600_000),
          last_used_at: now,
          download_count: 3,
        },
        {
          id: "link-revoked",
          artifact_id: artifact.id,
          token_hash: "hash-revoked",
          token_prefix: "efgh5678",
          created_at: now,
          revoked_at: now,
          download_count: 0,
        },
      ]);

      const [listed] = await service.listByConversation(conversationId);
      expect(listed?.shareLinks).toHaveLength(1);
      expect(listed?.shareLinks[0]?.id).toBe("link-active");
      expect(listed?.shareLinks[0]?.downloadCount).toBe(3);

      const fetched = await service.getArtifact(artifact.id);
      expect(fetched?.shareLinks).toHaveLength(1);
    } finally {
      await testDb.cleanup();
    }
  });

  it("defaults the mime type for unknown extensions", async () => {
    const { testDb, service } = await setup();
    try {
      const agentId = await insertAgent(testDb.client.db);
      const conversationId = await insertConversation(testDb.client.db, agentId);
      const artifact = await service.create({
        conversationId,
        title: "Binary",
        type: "file",
        link: "reports/output.bin",
      });
      const absolute = join(testDb.config.paths.workspaceDir, "reports/output.bin");
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, "0101", "utf8");

      const published = await service.publishArtifact(artifact.id);
      expect(published.mimeType).toBe("application/octet-stream");
    } finally {
      await testDb.cleanup();
    }
  });
});
