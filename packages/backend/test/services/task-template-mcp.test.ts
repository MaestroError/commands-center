import { describe, expect, it } from "vitest";

import { agents } from "../../src/db/schema/index";
import type { AppDb } from "../../src/db/client";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";

async function insertAgent(db: AppDb, id = "agent-tmpl-mcp"): Promise<string> {
  const [agent] = await db
    .insert(agents)
    .values({
      id,
      slug: id,
      name: "Template MCP Agent",
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

describe("task template MCP config", () => {
  it("derives a default MCP tool name and config from the title", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agentId = await insertAgent(testDb.client.db);
      const template = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "Create LinkedIn Post",
        description: "Draft a post.",
      });

      expect(template.mcpConfig).toMatchObject({
        exposeAsTool: true,
        toolName: "create_linkedin_post",
        allowFiles: true,
        asyncEnabled: false,
        artifacts: { displayableUrlEnabled: true, downloadableUrlEnabled: true },
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("accepts a custom tool name and config on create", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agentId = await insertAgent(testDb.client.db);
      const template = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "Weekly Report",
        description: "",
        mcpConfig: { toolName: "make_report", allowFiles: false, exposeAsTool: false },
      });

      expect(template.mcpConfig).toMatchObject({
        toolName: "make_report",
        allowFiles: false,
        exposeAsTool: false,
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects a tool name that collides with another template", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agentId = await insertAgent(testDb.client.db);
      await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "Report",
        description: "",
        mcpConfig: { toolName: "make_report" },
      });

      await expect(
        taskService.createTemplate({
          defaultAgentId: agentId,
          title: "Other",
          description: "",
          mcpConfig: { toolName: "make_report" },
        }),
      ).rejects.toThrow(/already used/i);
    } finally {
      await testDb.cleanup();
    }
  });

  it("rejects reserved core names and the _async suffix", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agentId = await insertAgent(testDb.client.db);

      await expect(
        taskService.createTemplate({
          defaultAgentId: agentId,
          title: "Bad reserved",
          description: "",
          mcpConfig: { toolName: "task_run" },
        }),
      ).rejects.toThrow(/reserved/i);

      await expect(
        taskService.createTemplate({
          defaultAgentId: agentId,
          title: "Bad async",
          description: "",
          mcpConfig: { toolName: "make_report_async" },
        }),
      ).rejects.toThrow(/reserved/i);
    } finally {
      await testDb.cleanup();
    }
  });

  it("does not re-derive an existing tool name when the title changes", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agentId = await insertAgent(testDb.client.db);
      const template = await taskService.createTemplate({
        defaultAgentId: agentId,
        title: "First Title",
        description: "",
      });
      expect(template.mcpConfig.toolName).toBe("first_title");

      const updated = await taskService.updateTemplate(template.id, { title: "Totally Renamed" });
      expect(updated?.mcpConfig.toolName).toBe("first_title");
    } finally {
      await testDb.cleanup();
    }
  });
});
