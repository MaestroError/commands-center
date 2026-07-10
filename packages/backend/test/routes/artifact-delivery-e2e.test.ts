import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { agents, conversations } from "../../src/db/schema/index";
import { createLogger } from "../../src/lib/logger";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import { createServer } from "../../src/server";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";
import { permissionsForPresets } from "../helpers/api-tokens";

type InjectServer = Awaited<ReturnType<typeof createServer>>;
type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;

async function seedRunWithArtifact(
  testDb: TestDb,
  options?: { artifactUrlsEnabled?: boolean },
): Promise<{ taskId: string; runId: string }> {
  const db = testDb.client.db;
  const taskService = createTaskService({ db, config: testDb.config });
  await db.insert(agents).values({
    id: "agent-e2e",
    slug: "agent-e2e",
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
  const task =
    options?.artifactUrlsEnabled === false
      ? await taskService
          .createTemplate({
            defaultAgentId: "agent-e2e",
            title: "Private deliverable",
            mcpConfig: {
              artifacts: { displayableUrlEnabled: false, downloadableUrlEnabled: false },
            },
          })
          .then((template) =>
            taskService.createTaskFromTemplate(template.id, { triggerSource: "api" }),
          )
      : await taskService.create({ agentId: "agent-e2e", title: "Deliverable task" });
  if (!task) {
    throw new Error("Failed to create artifact task.");
  }
  const run = await taskService.createRun({
    taskId: task.id,
    agentId: "agent-e2e",
    status: "running",
    triggerSource: "api",
    renderedPrompt: "p",
  });
  await db.insert(conversations).values({
    id: `conv-${run.id}`,
    agent_id: "agent-e2e",
    opencode_session_id: `s-${run.id}`,
    title: null,
    status: "active",
    source: "task_run",
    is_current: false,
    task_run_id: run.id,
    created_at: new Date(),
    updated_at: new Date(),
  });
  const absolute = join(testDb.config.paths.workspaceDir, "report.txt");
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, "the deliverable", "utf8");
  await taskService.addRunArtifact(run.id, "agent-e2e", {
    title: "Report",
    type: "file",
    link: "report.txt",
  });
  return { taskId: task.id, runId: run.id };
}

function pathOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

function parseSse(body: string): unknown {
  const line = body
    .split("\n")
    .find((entry) => entry.startsWith("data: ") && entry.slice(6).trim().startsWith("{"));
  if (!line) throw new Error(`No SSE data line: ${body}`);
  return JSON.parse(line.slice(6));
}

describe("artifact delivery end-to-end", () => {
  it("returns artifact metadata without public URLs when both template toggles are disabled", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await buildServer(testDb, apiTokenService);

    try {
      const { taskId, runId } = await seedRunWithArtifact(testDb, {
        artifactUrlsEnabled: false,
      });
      const token = apiTokenService.createToken("Tasks", permissionsForPresets("tasks")).token;
      const detail = await server.inject({
        method: "GET",
        url: `/api/public/v1/tasks/${taskId}/runs/${runId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(detail.statusCode).toBe(200);
      expect(detail.json<{ artifacts: unknown[] }>().artifacts).toEqual([
        { title: "Report", type: "file" },
      ]);
      expect(detail.body).not.toContain("displayUrl");
      expect(detail.body).not.toContain("downloadUrl");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns servable display/download URLs on the REST run detail", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await buildServer(testDb, apiTokenService);

    try {
      const { taskId, runId } = await seedRunWithArtifact(testDb);
      const token = apiTokenService.createToken("Tasks", permissionsForPresets("tasks")).token;

      const detail = await server.inject({
        method: "GET",
        url: `/api/public/v1/tasks/${taskId}/runs/${runId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(detail.statusCode).toBe(200);
      const body = detail.json<{
        artifacts: Array<{
          type: string;
          displayUrl: string;
          downloadUrl: string;
          mimeType: string;
        }>;
      }>();
      expect(body.artifacts).toHaveLength(1);
      const artifact = body.artifacts[0]!;
      expect(artifact).toMatchObject({ type: "file", mimeType: "text/plain" });
      expect(artifact.displayUrl).toContain("/display");
      expect(artifact.downloadUrl).toContain("/download");

      // The returned URL actually serves the deliverable.
      const served = await server.inject({ method: "GET", url: pathOf(artifact.displayUrl) });
      expect(served.statusCode).toBe(200);
      expect(served.body).toBe("the deliverable");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns enriched artifacts from the MCP get_task_result tool", async () => {
    const testDb = await createTestDatabase();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const server = await buildServer(testDb, apiTokenService);

    try {
      const { runId } = await seedRunWithArtifact(testDb);
      // Needs both tasks (task_run/get_task_run) and templates (get_task_run capability).
      const token = apiTokenService.createToken(
        "Both",
        permissionsForPresets("tasks", "templates"),
      ).token;

      const response = await server.inject({
        method: "POST",
        url: "/api/public/mcp",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "get_task_result", arguments: { runId } },
        },
      });
      expect(response.statusCode).toBe(200);
      const parsed = parseSse(response.body) as {
        result: { structuredContent: { artifacts: Array<{ displayUrl: string }> } };
      };
      expect(parsed.result.structuredContent.artifacts[0]?.displayUrl).toContain("/display");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

async function buildServer(
  testDb: TestDb,
  apiTokenService: ReturnType<typeof createApiTokenService>,
): Promise<InjectServer> {
  const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
  return createServer({
    config: testDb.config,
    logger: createLogger(testDb.config),
    database: testDb.client,
    apiTokenService,
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
