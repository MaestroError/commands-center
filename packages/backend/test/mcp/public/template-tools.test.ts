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

function tokenWithTemplates(templateIds: string[]): ApiTokenRecord {
  return {
    id: "tok-1",
    name: "MCP",
    tokenPrefix: "cc_x",
    permissions: { capabilities: [], templates: templateIds },
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
    });
    const reserved = new Set(RESERVED_MCP_TOOL_NAMES);

    for (const tool of registry) {
      expect(reserved.has(tool.name), `registry tool '${tool.name}' must be reserved`).toBe(true);
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

  it("hides templates that are disabled or not exposed", async () => {
    const testDb = await createTestDatabase();
    const { taskService, builder } = buildBuilder(testDb);

    try {
      const agentId = await insertAgent(testDb.client.db);

      const notExposed = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "Hidden Tool",
        description: "",
        mcpConfig: { exposeAsTool: false },
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
