import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agents, task_runs } from "../../src/db/schema/index.js";
import { createTaskService } from "../../src/services/task-service.js";
import { renameTaskMcpReferences } from "../../src/services/task-mcp-reference-sync.js";
import { templateFilePath } from "../../src/services/task-service/template-files.js";
import { createTestDatabase } from "../helpers/db.js";

async function fixture() {
  const db = await createTestDatabase();
  const now = new Date();
  await db.client.db.insert(agents).values({
    id: "agent",
    slug: "agent",
    name: "Agent",
    role: "Test",
    instructions: "Test",
    default_model: "test/model",
    capabilities_json: "{}",
    status: "active",
    created_at: now,
    updated_at: now,
  });
  const service = createTaskService({ db: db.client.db, config: db.config });
  const permissionProfile = {
    mcpServers: [{ name: "mail", enabled: true, action: "allow" as const }],
    toolPermissions: [{ pattern: "mail_*", action: "deny" as const }],
    mcpToolPermissions: [{ server: "mail", tool: "send", action: "allow" as const }],
    customTools: ["keep"],
  };
  const task = await service.create({ agentId: "agent", title: "Task", permissionProfile });
  const template = await service.createTemplate({
    defaultAgentId: "agent",
    title: "Template",
    permissionProfile,
  });
  return { db, service, task, template, permissionProfile };
}

describe("task MCP references", () => {
  it("renames future task permissions while preserving unrelated fields", async () => {
    const f = await fixture();
    try {
      await renameTaskMcpReferences(f.db.client.db, f.db.config, "mail", "inbox");
      expect((await f.service.get(f.task.id))?.permissionProfile).toEqual({
        ...f.permissionProfile,
        mcpServers: [{ name: "inbox", enabled: true, action: "allow" }],
        toolPermissions: [{ pattern: "inbox_*", action: "deny" }],
        mcpToolPermissions: [{ server: "inbox", tool: "send", action: "allow" }],
      });
    } finally {
      await f.db.cleanup();
    }
  });
  it("persists renamed template permissions in portable files", async () => {
    const f = await fixture();
    try {
      await renameTaskMcpReferences(f.db.client.db, f.db.config, "mail", "inbox");
      const file = JSON.parse(await readFile(templateFilePath(f.db.config, f.template.id), "utf8"));
      expect(file.permissionProfile.mcpToolPermissions).toEqual([
        { server: "inbox", tool: "send", action: "allow" },
      ]);
    } finally {
      await f.db.cleanup();
    }
  });
  it("generates new tasks with renamed template grants", async () => {
    const f = await fixture();
    try {
      await renameTaskMcpReferences(f.db.client.db, f.db.config, "mail", "inbox");
      const task = await f.service.createTaskFromTemplate(f.template.id, {
        occurrenceAt: "2026-10-23T10:00:00.000Z",
        triggerSource: "template",
      });
      expect(task?.permissionProfile?.mcpToolPermissions).toEqual([
        { server: "inbox", tool: "send", action: "allow" },
      ]);
    } finally {
      await f.db.cleanup();
    }
  });
  it("does not rewrite existing run snapshots", async () => {
    const f = await fixture();
    try {
      const snapshot = JSON.stringify(f.permissionProfile);
      await f.db.client.db.insert(task_runs).values({
        id: "run",
        task_id: f.task.id,
        agent_id: "agent",
        status: "queued",
        trigger_source: "manual",
        rendered_prompt: "Test",
        effective_permissions_json: snapshot,
        created_at: new Date(),
        updated_at: new Date(),
      });
      await renameTaskMcpReferences(f.db.client.db, f.db.config, "mail", "inbox");
      const [run] = await f.db.client.db.select().from(task_runs).where(eq(task_runs.id, "run"));
      expect(run?.effective_permissions_json).toBe(snapshot);
    } finally {
      await f.db.cleanup();
    }
  });
});
