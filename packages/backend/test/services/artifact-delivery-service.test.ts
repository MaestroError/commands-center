import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { Artifact } from "@cc/shared/schemas";

import { agents, conversations } from "../../src/db/schema/index";
import type { AppDb } from "../../src/db/client";
import { createArtifactDeliveryService } from "../../src/services/artifact-delivery-service";
import { createArtifactService } from "../../src/services/artifact-service";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";

async function seedArtifact(
  testDb: Awaited<ReturnType<typeof createTestDatabase>>,
  spec: { type: "file" | "url"; link: string; content?: string },
): Promise<Artifact> {
  const db: AppDb = testDb.client.db;
  const taskService = createTaskService({ db, config: testDb.config });
  const [agent] = await db
    .insert(agents)
    .values({
      id: "agent-art",
      slug: "agent-art",
      name: "A",
      role: "r",
      instructions: "i",
      default_model: "openai/gpt-4.1",
      icon_path: null,
      status: "active",
      capabilities_json: "{}",
      created_at: new Date(),
      updated_at: new Date(),
      archived_at: null,
    })
    .returning();
  const task = await taskService.create({ agentId: agent!.id, title: "T" });
  const run = await taskService.createRun({
    taskId: task.id,
    agentId: agent!.id,
    status: "running",
    triggerSource: "manual",
    renderedPrompt: "p",
  });

  await db.insert(conversations).values({
    id: `conv-${run.id}`,
    agent_id: agent!.id,
    opencode_session_id: `s-${run.id}`,
    title: null,
    status: "active",
    source: "task_run",
    is_current: false,
    task_run_id: run.id,
    created_at: new Date(),
    updated_at: new Date(),
  });

  if (spec.content !== undefined) {
    const absolute = join(testDb.config.paths.workspaceDir, spec.link);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, spec.content, "utf8");
  }

  await taskService.addRunArtifact(run.id, agent!.id, {
    title: "Artifact",
    type: spec.type,
    link: spec.link,
  });
  const refreshed = await taskService.getRunById(run.id);
  return refreshed!.artifacts[0]!;
}

describe("createArtifactDeliveryService", () => {
  it("returns metadata without publishing when both URL types are disabled", async () => {
    const testDb = await createTestDatabase();
    const publishArtifact = vi.fn();
    const delivery = createArtifactDeliveryService({
      artifactService: { publishArtifact },
      config: testDb.config,
    });

    try {
      const result = await delivery.buildDelivery(
        {
          id: "artifact-private",
          conversationId: "conversation-1",
          title: "Artifact",
          type: "file",
          link: "reports/private.txt",
          createdAt: new Date().toISOString(),
          shareLinks: [],
        },
        {
          displayEnabled: false,
          downloadEnabled: false,
          baseUrl: "https://cc.example.test",
          expiresAtMs: 0,
        },
      );

      expect(result).toEqual({ title: "Artifact", description: undefined, type: "file" });
      expect(publishArtifact).not.toHaveBeenCalled();
    } finally {
      await testDb.cleanup();
    }
  });

  it("suppresses external URL artifact links when display is disabled", async () => {
    const testDb = await createTestDatabase();
    const artifactService = createArtifactService({ db: testDb.client.db, config: testDb.config });
    const delivery = createArtifactDeliveryService({ artifactService, config: testDb.config });

    try {
      const artifact = await seedArtifact(testDb, {
        type: "url",
        link: "https://example.com/private",
      });
      const result = await delivery.buildDelivery(artifact, {
        displayEnabled: false,
        downloadEnabled: false,
        baseUrl: "https://cc.example.test",
        expiresAtMs: 0,
      });

      expect(result.displayUrl).toBeNull();
      expect(JSON.stringify(result)).not.toContain("example.com/private");
    } finally {
      await testDb.cleanup();
    }
  });

  it("passes a url artifact's link through as displayUrl with no download", async () => {
    const testDb = await createTestDatabase();
    const artifactService = createArtifactService({ db: testDb.client.db, config: testDb.config });
    const delivery = createArtifactDeliveryService({ artifactService, config: testDb.config });

    try {
      const artifact = await seedArtifact(testDb, {
        type: "url",
        link: "https://example.com/post",
      });
      const result = await delivery.buildDelivery(artifact, {
        displayEnabled: true,
        downloadEnabled: true,
        baseUrl: "https://cc.example.test",
        expiresAtMs: 0,
      });

      expect(result).toMatchObject({
        type: "url",
        displayUrl: "https://example.com/post",
        downloadUrl: null,
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("signs display + download URLs for a file artifact and honors toggles", async () => {
    const testDb = await createTestDatabase();
    const artifactService = createArtifactService({ db: testDb.client.db, config: testDb.config });
    const delivery = createArtifactDeliveryService({ artifactService, config: testDb.config });

    try {
      const artifact = await seedArtifact(testDb, {
        type: "file",
        link: "reports/notes.txt",
        content: "hello",
      });

      const both = await delivery.buildDelivery(artifact, {
        displayEnabled: true,
        downloadEnabled: true,
        baseUrl: "https://cc.example.test",
        expiresAtMs: Date.now() + 60_000,
      });
      expect(both.mimeType).toBe("text/plain");
      expect(both.sizeBytes).toBe(5);
      expect(both.displayUrl).toContain(`/artifacts/${artifact.id}/display`);
      expect(both.downloadUrl).toContain(`/artifacts/${artifact.id}/download`);

      const displayOnly = await delivery.buildDelivery(artifact, {
        displayEnabled: true,
        downloadEnabled: false,
        baseUrl: "https://cc.example.test",
        expiresAtMs: 0,
      });
      expect(displayOnly.displayUrl).toContain("/display");
      expect(displayOnly.downloadUrl).toBeNull();
    } finally {
      await testDb.cleanup();
    }
  });
});
