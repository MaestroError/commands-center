import { describe, expect, it } from "vitest";

import { RESERVED_MCP_TOOL_NAMES, type ApiTokenRecord } from "@cc/shared/schemas";

import { agents } from "../../../src/db/schema/index";
import type { AppDb } from "../../../src/db/client";
import { createPublicMcpRegistry } from "../../../src/mcp/public/registry";
import { createPublicMcpRunService } from "../../../src/mcp/public/run-service";
import { createPublicMcpTemplateToolBuilder } from "../../../src/mcp/public/template-tools";
import type { createPublicTaskApiService } from "../../../src/services/public-task-api-service";
import { createTaskContextAttachmentService } from "../../../src/services/task-context-attachment-service";
import { createTaskExecutionService } from "../../../src/services/task-execution-service";
import { createTaskService } from "../../../src/services/task-service";
import { createTestDatabase } from "../../helpers/db";

function tokenWithTemplates(templateIds: string[], capabilities: string[] = []): ApiTokenRecord {
  return {
    id: "tok-1",
    name: "MCP",
    tokenPrefix: "cc_x",
    permissions: {
      capabilities,
      templates: templateIds,
      documents: { global: false, privateSpecialistIds: [] },
    },
    createdAt: Date.now(),
    lastUsedAt: null,
    revokedAt: null,
  };
}

async function insertAgent(db: AppDb): Promise<string> {
  const [agent] = await db
    .insert(agents)
    .values({
      id: "agent-tmpl-tools",
      slug: "tmpl-tools-agent",
      name: "Template Tools Agent",
      role: "run tasks",
      instructions: "Run tasks.",
      default_model: "openai/gpt-4.1",
      icon_path: null,
      status: "active",
      capabilities_json: JSON.stringify({ appMcpServers: [], appToolPermissions: [] }),
      created_at: new Date(),
      updated_at: new Date(),
      archived_at: null,
    })
    .returning();

  if (!agent) {
    throw new Error("Failed to insert agent.");
  }

  return agent.id;
}

function buildBuilder(testDb: Awaited<ReturnType<typeof createTestDatabase>>) {
  const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
  const executionService = createTaskExecutionService({ taskService });
  const taskContextAttachmentService = createTaskContextAttachmentService({
    config: testDb.config,
    taskService,
  });
  const runService = createPublicMcpRunService({ taskService });
  const builder = createPublicMcpTemplateToolBuilder({
    taskService,
    executionService,
    taskContextAttachmentService,
    runService,
  });
  return { taskService, builder };
}

describe("public MCP template tools", () => {
  it("keeps registry tool names within the reserved set (shared source of truth)", () => {
    const registry = createPublicMcpRegistry({
      service: {} as ReturnType<typeof createPublicTaskApiService>,
      runService: {} as ReturnType<typeof createPublicMcpRunService>,
      documentService: {} as never,
    });
    const reserved = new Set(RESERVED_MCP_TOOL_NAMES);

    for (const tool of registry) {
      expect(reserved.has(tool.name), `registry tool '${tool.name}' must be reserved`).toBe(true);
      if (tool.asyncVariant) {
        expect(
          reserved.has(tool.asyncVariant.name),
          `async tool '${tool.asyncVariant.name}' must be reserved`,
        ).toBe(true);
      }
    }
  });

  it("exposes a template as a tool only when enabled, exposed, and token-enabled", async () => {
    const testDb = await createTestDatabase();
    const { taskService, builder } = buildBuilder(testDb);

    try {
      const agentId = await insertAgent(testDb.client.db);
      const template = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "Create LinkedIn Post",
        description: "Draft a post.",
      });

      const enabledTools = await builder.buildForToken(tokenWithTemplates([template.id]));
      expect(enabledTools.map((tool) => tool.name)).toEqual(["create_linkedin_post"]);

      // Token doesn't enable the template.
      expect(await builder.buildForToken(tokenWithTemplates([]))).toHaveLength(0);
    } finally {
      await testDb.cleanup();
    }
  });

  it("adds an async variant whenever async is enabled", async () => {
    const testDb = await createTestDatabase();
    const { taskService, builder } = buildBuilder(testDb);

    try {
      const agentId = await insertAgent(testDb.client.db);
      const template = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "Async Post",
        description: "",
        mcpConfig: { toolName: "async_post", asyncEnabled: true },
      });

      const withPoll = await builder.buildForToken(
        tokenWithTemplates([template.id], ["get_task_run"]),
      );
      expect(withPoll.map((tool) => tool.name)).toEqual(["async_post", "async_post_async"]);

      const withoutPoll = await builder.buildForToken(tokenWithTemplates([template.id]));
      expect(withoutPoll.map((tool) => tool.name)).toEqual(["async_post", "async_post_async"]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("adds no async variant when the template has async disabled", async () => {
    const testDb = await createTestDatabase();
    const { taskService, builder } = buildBuilder(testDb);

    try {
      const agentId = await insertAgent(testDb.client.db);
      const template = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "Sync Only",
        description: "",
        mcpConfig: { toolName: "sync_only", asyncEnabled: false },
      });

      const tools = await builder.buildForToken(
        tokenWithTemplates([template.id], ["get_task_run"]),
      );
      expect(tools.map((tool) => tool.name)).toEqual(["sync_only"]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("supports an async-only template tool", async () => {
    const testDb = await createTestDatabase();
    const { taskService, builder } = buildBuilder(testDb);

    try {
      const agentId = await insertAgent(testDb.client.db);
      const template = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "Async Only",
        description: "",
        mcpConfig: { toolName: "async_only", syncEnabled: false, asyncEnabled: true },
      });

      const tools = await builder.buildForToken(tokenWithTemplates([template.id]));
      expect(tools.map((tool) => tool.name)).toEqual(["async_only_async"]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns a run id from async when result checking is allowed", async () => {
    const testDb = await createTestDatabase();
    const { taskService, builder } = buildBuilder(testDb);

    try {
      const agentId = await insertAgent(testDb.client.db);
      const template = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "Pollable Async",
        description: "",
        mcpConfig: { toolName: "pollable_job", asyncEnabled: true },
      });
      const tools = await builder.buildForToken(
        tokenWithTemplates([template.id], ["get_task_run"]),
      );
      const result = await tools.find((tool) => tool.name === "pollable_job_async")!.execute({});

      expect(result.content[0]?.text).toMatch(/runId: .+\. Poll get_task_result/);
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns only acknowledgement from async when result checking is unavailable", async () => {
    const testDb = await createTestDatabase();
    const { taskService, builder } = buildBuilder(testDb);

    try {
      const agentId = await insertAgent(testDb.client.db);
      const template = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "Acknowledged Async",
        description: "",
        mcpConfig: { toolName: "acknowledged_job", asyncEnabled: true },
      });
      const tools = await builder.buildForToken(tokenWithTemplates([template.id]));
      const result = await tools
        .find((tool) => tool.name === "acknowledged_job_async")!
        .execute({});

      expect(result.content[0]?.text).toBe("Task registered successfully.");
      expect(result.structuredContent).toBeUndefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("override suppresses the run id when result checking is allowed", async () => {
    const testDb = await createTestDatabase();
    const { taskService, builder } = buildBuilder(testDb);

    try {
      const agentId = await insertAgent(testDb.client.db);
      const template = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "Fire And Forget",
        description: "",
        mcpConfig: {
          toolName: "fire_and_forget",
          asyncEnabled: true,
          asyncAlwaysAcknowledge: true,
        },
      });
      const tools = await builder.buildForToken(
        tokenWithTemplates([template.id], ["get_task_run"]),
      );
      const result = await tools.find((tool) => tool.name === "fire_and_forget_async")!.execute({});

      expect(result.content[0]?.text).toBe("Task registered successfully.");
      expect(result.structuredContent).toBeUndefined();
    } finally {
      await testDb.cleanup();
    }
  });

  it("hides templates that are disabled or not exposed", async () => {
    const testDb = await createTestDatabase();
    const { taskService, builder } = buildBuilder(testDb);

    try {
      const agentId = await insertAgent(testDb.client.db);

      const notExposed = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "Hidden Tool",
        description: "",
        mcpConfig: { syncEnabled: false },
      });
      const disabled = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "Disabled Tool",
        description: "",
        enabled: false,
      });

      const tools = await builder.buildForToken(tokenWithTemplates([notExposed.id, disabled.id]));
      expect(tools).toHaveLength(0);
    } finally {
      await testDb.cleanup();
    }
  });

  it("omits the files argument when allowFiles is off", async () => {
    const testDb = await createTestDatabase();
    const { taskService, builder } = buildBuilder(testDb);

    try {
      const agentId = await insertAgent(testDb.client.db);
      const withFiles = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "With Files",
        description: "",
        mcpConfig: { toolName: "with_files", allowFiles: true },
      });
      const noFiles = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "No Files",
        description: "",
        mcpConfig: { toolName: "no_files", allowFiles: false },
      });

      const tools = await builder.buildForToken(tokenWithTemplates([withFiles.id, noFiles.id]));
      const shapeKeys = (tool: (typeof tools)[number]) =>
        Object.keys((tool.inputSchema as unknown as { shape: Record<string, unknown> }).shape);

      expect(shapeKeys(tools.find((tool) => tool.name === "with_files")!)).toContain("files");
      expect(shapeKeys(tools.find((tool) => tool.name === "no_files")!)).not.toContain("files");
    } finally {
      await testDb.cleanup();
    }
  });
});
