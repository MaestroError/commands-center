import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import type { AppDb } from "../../src/db/client";
import { agents, artifact_share_links, conversations } from "../../src/db/schema/index";
import { createLogger } from "../../src/lib/logger";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createSecretService } from "../../src/services/secret-service";
import { createTaskService } from "../../src/services/task-service";
import { createServer } from "../../src/server";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

async function setup() {
  const testDb = await createTestDatabase();
  const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
  const server = createServer({
    config: {
      ...testDb.config,
      security: { ...testDb.config.security, publicOrigin: "https://cc.example.test" },
    },
    logger: createLogger(testDb.config),
    database: testDb.client,
    orchestrator: createOrchestrator(),
    opencodeService: {} as OpenCodeService,
    openCodeEventService: { subscribe: () => {} },
    secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    apiTokenService: createApiTokenService({ db: testDb.client.db }),
    scheduler: {
      getStatus: () => ({ state: "inactive", healthy: true, driver: "none" }),
    },
    taskService,
  });

  return { testDb, taskService, server };
}

describe("task artifact sharing", () => {
  it("publishes a local artifact and downloads it through a signed URL", async () => {
    const { testDb, taskService, server } = await setup();

    try {
      const { taskId, runId } = await createRunWithArtifact(testDb.client.db, taskService, {
        workspaceDir: testDb.config.paths.workspaceDir,
        artifactPath: "reports/release.md",
        content: "release notes",
      });

      const listed = await server.inject({
        method: "GET",
        url: `/api/tasks/${taskId}/runs/${runId}/artifacts`,
      });
      expect(listed.statusCode).toBe(200);
      const artifact = listed.json<{
        artifacts: Array<{ id: string; type: string; shareLinks: unknown[] }>;
      }>().artifacts[0];
      expect(artifact?.type).toBe("file");

      const created = await server.inject({
        method: "POST",
        url: `/api/artifacts/${artifact?.id}/share-links`,
        payload: {},
      });
      expect(created.statusCode).toBe(200);
      const share = created.json<{
        shareId: string;
        url: string;
        displayUrl: string;
        downloadUrl: string;
        expiresAt: string;
      }>();
      expect(share.url).toContain("https://cc.example.test/api/public/v1/task-artifacts/download/");
      expect(share.displayUrl).toContain("https://cc.example.test/api/public/v1/artifacts/");
      expect(share.displayUrl).toContain("/display?");
      expect(share.downloadUrl).toContain("https://cc.example.test/api/public/v1/artifacts/");
      expect(share.downloadUrl).toContain("/download?");
      expect(share.expiresAt).toMatch(/Z$/);

      const row = await testDb.client.db.query.artifact_share_links.findFirst({
        where: (table, operators) => operators.eq(table.id, share.shareId),
      });
      const rawToken = new URL(share.url).searchParams.get("token");
      expect(rawToken).toBeTruthy();
      expect(row?.token_hash).not.toBe(rawToken);
      expect(row?.token_prefix).toHaveLength(8);

      const downloadUrl = new URL(share.url);
      const downloaded = await server.inject({
        method: "GET",
        url: `${downloadUrl.pathname}${downloadUrl.search}`,
      });
      expect(downloaded.statusCode).toBe(200);
      expect(downloaded.body).toBe("release notes");
      expect(downloaded.headers["x-content-type-options"]).toBe("nosniff");
      expect(downloaded.headers["cache-control"]).toBe("no-store, max-age=0");
      expect(downloaded.headers["content-disposition"]).toContain("release.md");

      const displayUrl = new URL(share.displayUrl);
      const displayed = await server.inject({
        method: "GET",
        url: `${displayUrl.pathname}${displayUrl.search}`,
      });
      expect(displayed.statusCode).toBe(200);
      expect(displayed.body).toBe("release notes");
      expect(displayed.headers["content-disposition"]).toContain("inline");

      const publicDownloadUrl = new URL(share.downloadUrl);
      const publicDownloaded = await server.inject({
        method: "GET",
        url: `${publicDownloadUrl.pathname}${publicDownloadUrl.search}`,
      });
      expect(publicDownloaded.statusCode).toBe(200);
      expect(publicDownloaded.body).toBe("release notes");
      expect(publicDownloaded.headers["content-disposition"]).toContain("attachment");

      const afterDownload = await testDb.client.db.query.artifact_share_links.findFirst({
        where: (table, operators) => operators.eq(table.id, share.shareId),
      });
      expect(afterDownload?.download_count).toBe(1);
      expect(afterDownload?.last_used_at).toBeInstanceOf(Date);

      const relisted = await server.inject({
        method: "GET",
        url: `/api/tasks/${taskId}/runs/${runId}/artifacts`,
      });
      expect(
        relisted.json<{ artifacts: Array<{ shareLinks: unknown[] }> }>().artifacts[0]?.shareLinks,
      ).toHaveLength(1);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns 404 for revoked, expired, and bad-token signed URLs", async () => {
    const { testDb, taskService, server } = await setup();

    try {
      const { taskId, runId } = await createRunWithArtifact(testDb.client.db, taskService, {
        workspaceDir: testDb.config.paths.workspaceDir,
        artifactPath: "reports/private.md",
        content: "private report",
      });
      const artifact = (
        await server.inject({
          method: "GET",
          url: `/api/tasks/${taskId}/runs/${runId}/artifacts`,
        })
      ).json<{ artifacts: Array<{ id: string }> }>().artifacts[0];

      const created = await server.inject({
        method: "POST",
        url: `/api/artifacts/${artifact?.id}/share-links`,
        payload: {},
      });
      const share = created.json<{ shareId: string; url: string }>();
      const url = new URL(share.url);

      const badToken = await server.inject({
        method: "GET",
        url: `${url.pathname}?token=bad`,
      });
      expect(badToken.statusCode).toBe(404);

      await testDb.client.db
        .update(artifact_share_links)
        .set({ expires_at: new Date("2000-01-01T00:00:00.000Z") })
        .where(eq(artifact_share_links.id, share.shareId));
      const expired = await server.inject({
        method: "GET",
        url: `${url.pathname}${url.search}`,
      });
      expect(expired.statusCode).toBe(404);

      await testDb.client.db
        .update(artifact_share_links)
        .set({ expires_at: new Date("2999-01-01T00:00:00.000Z") })
        .where(eq(artifact_share_links.id, share.shareId));
      const revokedResponse = await server.inject({
        method: "DELETE",
        url: `/api/artifacts/${artifact?.id}/share-links/${share.shareId}`,
      });
      expect(revokedResponse.statusCode).toBe(200);
      const revoked = await server.inject({
        method: "GET",
        url: `${url.pathname}${url.search}`,
      });
      expect(revoked.statusCode).toBe(404);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("persists artifact-sharing preferences in workspace settings", async () => {
    const { testDb, server } = await setup();

    try {
      const updated = await server.inject({
        method: "PUT",
        url: "/api/tasks/artifact-sharing/preferences",
        payload: { taskArtifactSignedUrlExpiresInMinutes: 0 },
      });
      const loaded = await server.inject({
        method: "GET",
        url: "/api/tasks/artifact-sharing/preferences",
      });

      expect(updated.statusCode).toBe(200);
      expect(loaded.json()).toEqual({ taskArtifactSignedUrlExpiresInMinutes: 0 });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("creates non-expiring signed URLs when preference expiry is zero", async () => {
    const { testDb, taskService, server } = await setup();

    try {
      const { taskId, runId } = await createRunWithArtifact(testDb.client.db, taskService, {
        workspaceDir: testDb.config.paths.workspaceDir,
        artifactPath: "reports/permanent.md",
        content: "permanent report",
      });
      await server.inject({
        method: "PUT",
        url: "/api/tasks/artifact-sharing/preferences",
        payload: { taskArtifactSignedUrlExpiresInMinutes: 0 },
      });
      const artifact = (
        await server.inject({
          method: "GET",
          url: `/api/tasks/${taskId}/runs/${runId}/artifacts`,
        })
      ).json<{ artifacts: Array<{ id: string }> }>().artifacts[0];

      const created = await server.inject({
        method: "POST",
        url: `/api/artifacts/${artifact?.id}/share-links`,
        payload: {},
      });
      expect(created.statusCode).toBe(200);
      const share = created.json<{
        shareId: string;
        url: string;
        displayUrl: string;
        downloadUrl: string;
        expiresAt: string | null;
      }>();
      expect(share.expiresAt).toBeNull();
      expect(new URL(share.displayUrl).searchParams.get("exp")).toBe("0");
      expect(new URL(share.downloadUrl).searchParams.get("exp")).toBe("0");

      const row = await testDb.client.db.query.artifact_share_links.findFirst({
        where: (table, operators) => operators.eq(table.id, share.shareId),
      });
      expect(row?.expires_at).toBeNull();

      const url = new URL(share.url);
      const downloaded = await server.inject({
        method: "GET",
        url: `${url.pathname}${url.search}`,
      });
      expect(downloaded.statusCode).toBe(200);
      expect(downloaded.body).toBe("permanent report");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns 404 when the run does not belong to the given task id", async () => {
    const { testDb, taskService, server } = await setup();

    try {
      const { runId } = await createRunWithArtifact(testDb.client.db, taskService, {
        workspaceDir: testDb.config.paths.workspaceDir,
        artifactPath: "reports/mismatch.md",
        content: "mismatch",
      });

      const listed = await server.inject({
        method: "GET",
        url: `/api/tasks/not-the-owning-task/runs/${runId}/artifacts`,
      });

      expect(listed.statusCode).toBe(404);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects sharing an artifact whose path escapes the workspace", async () => {
    const { testDb, taskService, server } = await setup();

    try {
      const agent = await insertAgent(testDb.client.db);
      const task = await taskService.create({ agentId: agent.id, title: "Publish report" });
      const run = await taskService.createRun({
        taskId: task.id,
        agentId: agent.id,
        status: "running",
        triggerSource: "manual",
        renderedPrompt: "Create report.",
      });
      await seedRunConversation(testDb.client.db, run.id, agent.id);
      await taskService.addRunArtifact(run.id, agent.id, {
        title: "Escaped report",
        type: "file",
        link: "../secret.md",
      });

      const artifact = (
        await server.inject({
          method: "GET",
          url: `/api/tasks/${task.id}/runs/${run.id}/artifacts`,
        })
      ).json<{ artifacts: Array<{ id: string }> }>().artifacts[0];

      const created = await server.inject({
        method: "POST",
        url: `/api/artifacts/${artifact?.id}/share-links`,
        payload: {},
      });

      expect(created.statusCode).toBe(400);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

async function createRunWithArtifact(
  db: AppDb,
  taskService: ReturnType<typeof createTaskService>,
  options: { workspaceDir: string; artifactPath: string; content: string },
): Promise<{ taskId: string; runId: string }> {
  const agent = await insertAgent(db);
  const task = await taskService.create({ agentId: agent.id, title: "Publish report" });
  const run = await taskService.createRun({
    taskId: task.id,
    agentId: agent.id,
    status: "running",
    triggerSource: "manual",
    renderedPrompt: "Create report.",
  });
  await seedRunConversation(db, run.id, agent.id);
  const absolutePath = join(options.workspaceDir, options.artifactPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, options.content, "utf8");
  await taskService.addRunArtifact(run.id, agent.id, {
    title: "Release report",
    type: "file",
    link: options.artifactPath,
  });

  return { taskId: task.id, runId: run.id };
}

// Artifacts anchor to a run's task-run conversation; addRunArtifact requires it
// to exist.
async function seedRunConversation(db: AppDb, runId: string, agentId: string): Promise<void> {
  const timestamp = new Date();
  await db.insert(conversations).values({
    id: `conv-${runId}`,
    agent_id: agentId,
    opencode_session_id: `session-${runId}`,
    title: null,
    status: "active",
    source: "task_run",
    is_current: false,
    task_run_id: runId,
    created_at: timestamp,
    updated_at: timestamp,
  });
}

async function insertAgent(db: AppDb): Promise<typeof agents.$inferSelect> {
  const timestamp = new Date();
  const id = `agent-${randomUUID()}`;
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

function createOrchestrator(): OpenCodeOrchestrator {
  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
    getStatus: () => ({
      state: "healthy",
      healthy: true,
      url: "http://127.0.0.1:4100",
      workspaceDir: "/tmp/workspace",
      restartCount: 0,
      maxRestarts: 3,
    }),
  };
}
