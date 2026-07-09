import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { agents, conversations } from "../../src/db/schema/index";
import { createLogger } from "../../src/lib/logger";
import { buildArtifactSignedPath } from "../../src/lib/artifact-signed-url";
import { createOwnerSessionCookie } from "../../src/lib/owner-session-cookie";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import { createServer } from "../../src/server";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createOwnerAccessService } from "../../src/services/owner-access-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";

const STRONG_PASSWORD = "CorrectHorseBatteryStaple42!";

type InjectServer = Awaited<ReturnType<typeof createServer>>;
type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;

async function seedArtifactId(
  testDb: TestDb,
  spec: { link: string; content: string },
): Promise<string> {
  const db = testDb.client.db;
  const taskService = createTaskService({ db, config: testDb.config });
  await db.insert(agents).values({
    id: "agent-serve",
    slug: "agent-serve",
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
  });
  const task = await taskService.create({ agentId: "agent-serve", title: "T" });
  const run = await taskService.createRun({
    taskId: task.id,
    agentId: "agent-serve",
    status: "running",
    triggerSource: "manual",
    renderedPrompt: "p",
  });
  await db.insert(conversations).values({
    id: `conv-${run.id}`,
    agent_id: "agent-serve",
    opencode_session_id: `s-${run.id}`,
    title: null,
    status: "active",
    source: "task_run",
    is_current: false,
    task_run_id: run.id,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const absolute = join(testDb.config.paths.workspaceDir, spec.link);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, spec.content, "utf8");
  await taskService.addRunArtifact(run.id, "agent-serve", {
    title: "Artifact",
    type: "file",
    link: spec.link,
  });
  const refreshed = await taskService.getRunById(run.id);
  return refreshed!.artifacts[0]!.id;
}

function signedPath(
  testDb: TestDb,
  artifactId: string,
  disposition: "display" | "download",
  expMs: number,
): string {
  return buildArtifactSignedPath({
    artifactId,
    disposition,
    expMs,
    secretKey: testDb.config.secretKey,
  });
}

describe("public artifact delivery routes", () => {
  it("serves a renderable file inline for display and as an attachment for download", async () => {
    const testDb = await createTestDatabase();
    const server = await buildServer(testDb);

    try {
      const artifactId = await seedArtifactId(testDb, {
        link: "notes.txt",
        content: "hello world",
      });
      const exp = Date.now() + 60_000;

      const display = await server.inject({
        method: "GET",
        url: signedPath(testDb, artifactId, "display", exp),
      });
      expect(display.statusCode).toBe(200);
      expect(display.headers["content-type"]).toContain("text/plain");
      expect(display.headers["content-disposition"]).toContain("inline");
      expect(display.headers["x-content-type-options"]).toBe("nosniff");
      expect(display.body).toBe("hello world");

      const download = await server.inject({
        method: "GET",
        url: signedPath(testDb, artifactId, "download", exp),
      });
      expect(download.statusCode).toBe(200);
      expect(download.headers["content-disposition"]).toContain("attachment");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("shows a download page for non-renderable display and 404s a tampered signature", async () => {
    const testDb = await createTestDatabase();
    const server = await buildServer(testDb);

    try {
      const artifactId = await seedArtifactId(testDb, { link: "bundle.zip", content: "PKzip" });
      const exp = Date.now() + 60_000;

      const display = await server.inject({
        method: "GET",
        url: signedPath(testDb, artifactId, "display", exp),
      });
      expect(display.statusCode).toBe(200);
      expect(display.headers["content-type"]).toContain("text/html");
      expect(display.body).toContain("Download");
      expect(display.body).toContain("bundle.zip");

      const tampered = await server.inject({
        method: "GET",
        url: `/api/public/v1/artifacts/${artifactId}/download?exp=${exp}&sig=deadbeef`,
      });
      expect(tampered.statusCode).toBe(404);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("hard-expires download but gates expired display via login for browsers", async () => {
    const testDb = await createTestDatabase();
    const server = await buildServer(testDb);

    try {
      const artifactId = await seedArtifactId(testDb, { link: "notes.txt", content: "hi" });
      const expiredAt = Date.now() - 1000;

      const download = await server.inject({
        method: "GET",
        url: signedPath(testDb, artifactId, "download", expiredAt),
      });
      expect(download.statusCode).toBe(404);

      // Expired display, browser (no owner session) → redirect to login.
      const browser = await server.inject({
        method: "GET",
        url: signedPath(testDb, artifactId, "display", expiredAt),
        headers: { accept: "text/html" },
      });
      expect(browser.statusCode).toBe(302);
      expect(browser.headers["location"]).toContain("/login");

      // Expired display, API client → 401.
      const api = await server.inject({
        method: "GET",
        url: signedPath(testDb, artifactId, "display", expiredAt),
      });
      expect(api.statusCode).toBe(401);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("streams an expired non-renderable display straight to an authenticated owner", async () => {
    const testDb = await createTestDatabase();
    const ownerAccessService = createOwnerAccessService({ config: testDb.config });
    const server = await buildServer(testDb, ownerAccessService);

    try {
      const artifactId = await seedArtifactId(testDb, { link: "bundle.zip", content: "PKzip" });
      const claim = await ownerAccessService.rotateClaimCode();
      await ownerAccessService.claim({
        claimCode: claim.code,
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      const session = await ownerAccessService.login({ password: STRONG_PASSWORD });
      const cookie = createOwnerSessionCookie({
        config: testDb.config,
        sessionId: session.sessionId,
      }).split(";")[0];

      // Expired signature, but an authenticated owner: no broken download-page
      // button — the bytes stream directly as an attachment.
      const response = await server.inject({
        method: "GET",
        url: signedPath(testDb, artifactId, "display", Date.now() - 1000),
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-disposition"]).toContain("attachment");
      expect(response.headers["content-type"]).not.toContain("text/html");
      expect(response.body).toBe("PKzip");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

async function buildServer(
  testDb: TestDb,
  ownerAccessService?: ReturnType<typeof createOwnerAccessService>,
): Promise<InjectServer> {
  const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
  return createServer({
    config: testDb.config,
    logger: createLogger(testDb.config),
    database: testDb.client,
    apiTokenService: createApiTokenService({ db: testDb.client.db }),
    ownerAccessService,
    orchestrator: createOrchestrator(),
    opencodeService: { dispose: () => {}, disposeGlobal: () => {} } as unknown as OpenCodeService,
    openCodeEventService: { subscribe: () => {} } as never,
    secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    scheduler: createSchedulerService(),
    taskService,
  });
}

function createOrchestrator(): OpenCodeOrchestrator {
  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
    getStatus: () => ({
      state: "healthy" as const,
      healthy: true,
      url: "http://127.0.0.1:4100",
      workspaceDir: "/tmp/workspace",
      restartCount: 0,
      maxRestarts: 3,
    }),
  };
}
