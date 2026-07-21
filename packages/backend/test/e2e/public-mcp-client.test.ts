import { randomUUID } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { agents } from "../../src/db/schema/index.js";
import type { AppDb } from "../../src/db/client.js";
import { createLogger } from "../../src/lib/logger.js";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator.js";
import { createServer } from "../../src/server.js";
import { createApiTokenService } from "../../src/services/api-token-service.js";
import { createDocumentService } from "../../src/services/document-service.js";
import { createSchedulerService } from "../../src/services/scheduler-service.js";
import { createSecretService } from "../../src/services/secret-service.js";
import { createTaskExecutionService } from "../../src/services/task-execution-service.js";
import { createTaskService } from "../../src/services/task-service.js";
import { createTokenAuditService } from "../../src/services/token-audit-service.js";
import { createMockOpenCodeService } from "../helpers/fake-opencode.js";
import { createTestDatabase } from "../helpers/db.js";
import { permissionsForPresets } from "../helpers/api-tokens.js";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type TestServer = Awaited<ReturnType<typeof createServer>>;
type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

const disposers: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) {
    await disposers.pop()?.();
  }
});

describe("public MCP client e2e", () => {
  it("supports the public MCP client workflow", async () => {
    const testDb = await makeTestDb();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const tokenAuditService = createTokenAuditService({
      db: testDb.client.db,
      config: testDb.config,
    });
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({
      db: testDb.client.db,
      taskService,
      defer: { initialDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 },
    });
    disposers.push(() => taskExecutionService.dispose());

    const agentId = await insertAgent(testDb.client.db);
    const existingTask = await taskService.create({
      agentId,
      title: "Existing MCP task",
      description: "Run me through public MCP.",
    });
    const template = await taskService.createTemplate({
      defaultAgentId: agentId,
      title: "Public MCP template",
      description: "Template exposed to public MCP.",
      mcpConfig: { toolName: "public_mcp_template", asyncEnabled: true },
    });
    const token = apiTokenService.createToken("Public MCP E2E", {
      ...permissionsForPresets("tasks", "templates"),
      templates: [template.id],
    });
    const server = await startServer(testDb, {
      apiTokenService,
      tokenAuditService,
      taskService,
      taskExecutionService,
    });
    const client = await connectMcpClient(server.baseUrl, token.token);
    disposers.push(() => client.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "create_task",
        "get_task",
        "list_tasks",
        "task_run",
        "task_template_run",
        "get_task_result",
        "public_mcp_template",
        "public_mcp_template_async",
      ]),
    );

    const createdTask = structured<{ task: { id: string; title: string } }>(
      await client.callTool({
        name: "create_task",
        arguments: {
          specialistId: agentId,
          title: "Created through MCP client",
          description: "Read me back through MCP.",
        },
      }),
    ).task;
    expect(createdTask.title).toBe("Created through MCP client");

    const readBack = structured<{ task: { id: string; title: string } }>(
      await client.callTool({ name: "get_task", arguments: { taskId: createdTask.id } }),
    ).task;
    expect(readBack).toMatchObject({ id: createdTask.id, title: "Created through MCP client" });

    const listedTasks = structured<{ tasks: Array<{ id: string; title: string }> }>(
      await client.callTool({ name: "list_tasks", arguments: {} }),
    ).tasks;
    expect(listedTasks.map((task) => task.id)).toEqual(expect.arrayContaining([createdTask.id]));

    const taskRun = structured<{
      taskId: string;
      runId: string;
      status: string;
      timedOut: boolean;
    }>(await client.callTool({ name: "task_run", arguments: { taskId: existingTask.id } }));
    expect(taskRun).toMatchObject({
      taskId: existingTask.id,
      status: "completed",
      timedOut: false,
    });
    await expect
      .poll(async () => (await taskService.getRunById(taskRun.runId))?.status)
      .toBe("completed");

    const templateRun = structured<{
      taskId: string;
      runId: string;
      status: string;
      timedOut: boolean;
    }>(
      await client.callTool({
        name: "task_template_run",
        arguments: { templateId: template.id, text: "Run from an MCP client." },
      }),
    );
    expect(templateRun).toMatchObject({ status: "completed", timedOut: false });
    const templateTask = await taskService.get(templateRun.taskId);
    expect(templateTask).toMatchObject({ sourceTemplateId: template.id });

    const dynamicRun = structured<{
      taskId: string;
      runId: string;
      status: string;
      timedOut: boolean;
    }>(
      await client.callTool({
        name: "public_mcp_template",
        arguments: { text: "Run through the dynamic template tool." },
      }),
    );
    expect(dynamicRun).toMatchObject({ status: "completed", timedOut: false });

    const polledResult = structured<{ runId: string; status: string; timedOut: boolean }>(
      await client.callTool({ name: "get_task_result", arguments: { runId: dynamicRun.runId } }),
    );
    expect(polledResult).toMatchObject({ runId: dynamicRun.runId, status: "completed" });

    await expect
      .poll(async () => {
        const activity = await tokenAuditService.listForToken({ tokenId: token.record.id });
        return activity.entries.map((entry) => entry.action);
      })
      .toEqual(
        expect.arrayContaining([
          "create_task",
          "get_task",
          "list_tasks",
          "task_run",
          "task_template_run",
          "public_mcp_template",
          "get_task_result",
        ]),
      );
  });

  it("reads token-scoped documents through the MCP client", async () => {
    const testDb = await makeTestDb();
    const apiTokenService = createApiTokenService({ db: testDb.client.db });
    const tokenAuditService = createTokenAuditService({
      db: testDb.client.db,
      config: testDb.config,
    });
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const taskExecutionService = createTaskExecutionService({
      db: testDb.client.db,
      taskService,
      defer: { initialDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 },
    });
    disposers.push(() => taskExecutionService.dispose());

    const agentId = await insertAgent(testDb.client.db, {
      id: "document-specialist-id",
      slug: "document-specialist",
    });
    const documents = createDocumentService({ db: testDb.client.db, config: testDb.config });
    await documents.create({
      scope: "global",
      path: "shared/launch-brief.md",
      content: "Global launch notes.",
    });
    await documents.create({
      scope: "private",
      ownerSpecialistId: agentId,
      path: "research/private-brief.md",
      content: "Private MCP discovery needle.",
    });
    const token = apiTokenService.createToken("Document MCP E2E", {
      ...permissionsForPresets("documents"),
      documents: { global: true, globalFolderPaths: [], privateSpecialistIds: [agentId] },
    });
    const server = await startServer(testDb, {
      apiTokenService,
      tokenAuditService,
      taskService,
      taskExecutionService,
    });
    const client = await connectMcpClient(server.baseUrl, token.token);
    disposers.push(() => client.close());

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "list_documents",
        "search_documents",
        "read_document",
        "create_document",
      ]),
    );

    const listed = structured<{
      documents: Array<{ scope: string; ownerSlug: string | null; relativePath: string }>;
    }>(await client.callTool({ name: "list_documents", arguments: {} }));
    expect(listed.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "global",
          ownerSlug: null,
          relativePath: "shared/launch-brief.md",
        }),
        expect.objectContaining({
          scope: "private",
          ownerSlug: "document-specialist",
          relativePath: "research/private-brief.md",
        }),
      ]),
    );

    const searched = structured<{
      documents: Array<{
        relativePath: string;
        matches: Array<{ kind: string; lineNumber: number | null }>;
      }>;
    }>(
      await client.callTool({
        name: "search_documents",
        arguments: { query: "needle", scope: "private", ownerSlug: "document-specialist" },
      }),
    );
    expect(searched.documents).toEqual([
      expect.objectContaining({
        relativePath: "research/private-brief.md",
        matches: expect.arrayContaining([
          expect.objectContaining({ kind: "content", lineNumber: 1 }),
        ]),
      }),
    ]);

    const read = structured<{
      scope: string;
      ownerSlug: string | null;
      relativePath: string;
      content: string;
    }>(
      await client.callTool({
        name: "read_document",
        arguments: {
          scope: "private",
          ownerSlug: "document-specialist",
          path: "research/private-brief.md",
        },
      }),
    );
    expect(read).toMatchObject({
      scope: "private",
      ownerSlug: "document-specialist",
      relativePath: "research/private-brief.md",
      content: "Private MCP discovery needle.",
    });

    const created = structured<{
      scope: string;
      ownerSlug: string | null;
      relativePath: string;
      title: string;
    }>(
      await client.callTool({
        name: "create_document",
        arguments: {
          scope: "global",
          path: "shared/created-by-mcp.md",
          title: "Created By MCP",
          content: "Fresh document body.",
        },
      }),
    );
    expect(created).toMatchObject({
      scope: "global",
      ownerSlug: null,
      relativePath: "shared/created-by-mcp.md",
      title: "Created By MCP",
    });

    const readBack = structured<{ content: string }>(
      await client.callTool({
        name: "read_document",
        arguments: { scope: "global", path: "shared/created-by-mcp.md" },
      }),
    );
    expect(readBack.content).toBe("Fresh document body.");

    await expect
      .poll(async () => {
        const activity = await tokenAuditService.listForToken({ tokenId: token.record.id });
        return activity.entries;
      })
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: "list_documents" }),
          expect.objectContaining({ action: "search_documents" }),
          expect.objectContaining({
            action: "read_document",
            targetKind: "document",
            targetId: "private:document-specialist:research/private-brief.md",
          }),
          expect.objectContaining({
            action: "create_document",
            targetKind: "document",
            targetId: "global:shared/created-by-mcp.md",
          }),
        ]),
      );
  });

  describe("folder-limited global document access", () => {
    const restrictedDisposers: Array<() => void | Promise<void>> = [];
    let client: Client;

    beforeAll(async () => {
      const testDb = await makeTestDb(restrictedDisposers);
      const apiTokenService = createApiTokenService({ db: testDb.client.db });
      const tokenAuditService = createTokenAuditService({
        db: testDb.client.db,
        config: testDb.config,
      });
      const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
      const taskExecutionService = createTaskExecutionService({
        db: testDb.client.db,
        taskService,
        defer: { initialDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 },
      });
      restrictedDisposers.push(() => taskExecutionService.dispose());

      const documents = createDocumentService({ db: testDb.client.db, config: testDb.config });
      await documents.create({
        path: "public/brief.md",
        title: "Public Brief",
        content: "Visible restriction needle.",
      });
      await documents.create({
        path: "public/nested/details.md",
        title: "Nested Details",
        content: "Authorized descendant content.",
      });
      await documents.create({
        path: "public-private/secret.md",
        title: "Hidden Secret",
        content: "Hidden restriction needle.",
      });

      const token = apiTokenService.createToken("Folder-limited MCP E2E", {
        capabilities: ["list_documents", "search_documents", "read_document", "create_document"],
        templates: [],
        documents: {
          global: false,
          globalFolderPaths: ["public"],
          privateSpecialistIds: [],
        },
      });
      const server = await startServer(
        testDb,
        { apiTokenService, tokenAuditService, taskService, taskExecutionService },
        restrictedDisposers,
      );
      client = await connectMcpClient(server.baseUrl, token.token);
      restrictedDisposers.push(() => client.close());
    });

    afterAll(async () => {
      while (restrictedDisposers.length > 0) {
        await restrictedDisposers.pop()?.();
      }
    });

    it("lists only documents in the granted folder and its descendants", async () => {
      const listed = structured<{ documents: Array<{ relativePath: string }> }>(
        await client.callTool({
          name: "list_documents",
          arguments: { scope: "global" },
        }),
      );

      expect(listed.documents.map((document) => document.relativePath)).toEqual([
        "public/brief.md",
        "public/nested/details.md",
      ]);
    });

    it("searches only content inside the granted folder", async () => {
      const searched = structured<{ documents: Array<{ relativePath: string }> }>(
        await client.callTool({
          name: "search_documents",
          arguments: { scope: "global", query: "restriction needle" },
        }),
      );

      expect(searched.documents.map((document) => document.relativePath)).toEqual([
        "public/brief.md",
      ]);
    });

    it("returns an MCP tool error when reading outside the granted folder", async () => {
      const result = await client.callTool({
        name: "read_document",
        arguments: { scope: "global", path: "public-private/secret.md" },
      });

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("Document not found.");
    });

    it("creates documents inside the granted folder", async () => {
      const created = structured<{ relativePath: string }>(
        await client.callTool({
          name: "create_document",
          arguments: {
            scope: "global",
            path: "public/nested/created.md",
            content: "Authorized MCP creation.",
          },
        }),
      );

      expect(created.relativePath).toBe("public/nested/created.md");
    });

    it("returns an MCP tool error when creating outside the granted folder", async () => {
      const result = await client.callTool({
        name: "create_document",
        arguments: {
          scope: "global",
          path: "public-private/created.md",
          content: "Unauthorized MCP creation.",
        },
      });

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("Document root not found.");
    });
  });
});

async function makeTestDb(disposerStack = disposers): Promise<TestDb> {
  const testDb = await createTestDatabase();
  disposerStack.push(() => testDb.cleanup());
  return testDb;
}

async function startServer(
  testDb: TestDb,
  deps: {
    apiTokenService: ReturnType<typeof createApiTokenService>;
    tokenAuditService: ReturnType<typeof createTokenAuditService>;
    taskService: ReturnType<typeof createTaskService>;
    taskExecutionService: ReturnType<typeof createTaskExecutionService>;
  },
  disposerStack = disposers,
): Promise<{ server: TestServer; baseUrl: string }> {
  const server = createServer({
    config: testDb.config,
    logger: createLogger(testDb.config),
    database: testDb.client,
    apiTokenService: deps.apiTokenService,
    tokenAuditService: deps.tokenAuditService,
    orchestrator: createOrchestrator(),
    opencodeService: createMockOpenCodeService(),
    openCodeEventService: { subscribe: () => {} } as never,
    secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    scheduler: createSchedulerService(),
    taskService: deps.taskService,
    taskExecutionService: deps.taskExecutionService,
  });
  await server.listen({ host: "127.0.0.1", port: 0 });
  disposerStack.push(() => server.close());

  const address = server.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected Fastify to listen on a TCP address.");
  }

  return { server, baseUrl: `http://127.0.0.1:${String(address.port)}` };
}

async function connectMcpClient(baseUrl: string, token: string): Promise<Client> {
  const client = new Client({ name: "public-mcp-e2e", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/public/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

function structured<T extends Record<string, unknown>>(result: ToolResult): T {
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as T;
}

async function insertAgent(db: AppDb, input: { id?: string; slug?: string } = {}): Promise<string> {
  const id = input.id ?? `agent-${randomUUID()}`;
  const slug = input.slug ?? id;
  await db.insert(agents).values({
    id,
    slug,
    name: "Public MCP Specialist",
    role: "run public MCP tasks",
    instructions: "Execute public MCP E2E tasks.",
    default_model: "openai/gpt-4.1",
    icon_path: null,
    status: "active",
    capabilities_json: JSON.stringify({ appMcpServers: [], appToolPermissions: [] }),
    created_at: new Date(),
    updated_at: new Date(),
    archived_at: null,
  });
  return id;
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
