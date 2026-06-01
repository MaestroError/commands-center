import { describe, expect, it } from "vitest";

import type { AppDb } from "../../src/db/client";
import { agents } from "../../src/db/schema/index";
import {
  buildOpenCodeSessionPermissions,
  createTaskPermissionService,
  mergeTaskPermissions,
} from "../../src/services/task-permission-service";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTaskService } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";

describe("createTaskPermissionService", () => {
  it("uses task overrides without mutating agent defaults", () => {
    const agentCapabilities = {
      customTools: ["agent-tool"],
      mcpServers: [{ name: "github", enabled: true, action: "ask" as const }],
      toolPermissions: [{ pattern: "bash_*", action: "ask" as const }],
      appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" as const }],
      appToolPermissions: [{ pattern: "cc_app_show_file_to_user", action: "allow" as const }],
    };

    const merged = mergeTaskPermissions(agentCapabilities, {
      customTools: ["task-tool"],
      toolPermissions: [{ pattern: "read", action: "allow" }],
    });

    expect(merged.customTools).toEqual(["task-tool"]);
    expect(merged.mcpServers).toEqual(agentCapabilities.mcpServers);
    expect(merged.toolPermissions).toEqual([{ pattern: "read", action: "allow" }]);
    expect(agentCapabilities.customTools).toEqual(["agent-tool"]);
    expect(agentCapabilities.toolPermissions).toEqual([{ pattern: "bash_*", action: "ask" }]);
  });

  it("denies chat-only app tools and converts ask rules for task runs", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const permissionService = createTaskPermissionService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: {} as OpenCodeService,
    });

    try {
      const agent = await insertAgent(testDb.client.db, {
        mcpServers: [{ name: "github", enabled: true, action: "ask" }],
        toolPermissions: [{ pattern: "bash_*", action: "ask" }],
        appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
        appToolPermissions: [{ pattern: "cc_app_show_file_to_user", action: "ask" }],
      });
      const task = await taskService.create({
        agentId: agent.id,
        title: "Permissioned task",
      });

      const effective = await permissionService.compute(task);

      expect(effective.appMcpServers).toEqual([
        { name: "cc_default", enabled: true, action: "allow" },
      ]);
      expect(effective.toolPermissions).toEqual([{ pattern: "bash_*", action: "allow" }]);
      expect(effective.appToolPermissions).toContainEqual({
        pattern: "cc_app_show_file_to_user",
        action: "deny",
      });
      expect(effective.appToolPermissions).toContainEqual({
        pattern: "cc_default_set_task_result",
        action: "allow",
      });
      expect(effective.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        "chat_only_tool_hidden_from_task_run",
      );
      expect(effective.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        "ask_mode_not_allowed_for_task_run",
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("preserves explicit denies for task-run app tools", async () => {
    const testDb = await createTestDatabase();
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const permissionService = createTaskPermissionService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: {} as OpenCodeService,
    });

    try {
      const agent = await insertAgent(testDb.client.db, {
        appToolPermissions: [{ pattern: "cc_default_set_task_result", action: "deny" }],
      });
      const task = await taskService.create({
        agentId: agent.id,
        title: "Restricted outcome task",
      });

      const effective = await permissionService.compute(task);

      expect(effective.appMcpServers).toEqual([
        { name: "cc_default", enabled: true, action: "allow" },
      ]);
      expect(effective.appToolPermissions).toContainEqual({
        pattern: "cc_default_set_task_result",
        action: "deny",
      });
      expect(
        effective.appToolPermissions?.filter(
          (rule) => rule.pattern === "cc_default_set_task_result" && rule.action === "allow",
        ),
      ).toEqual([]);
      expect(effective.appToolPermissions).toContainEqual({
        pattern: "cc_default_add_task_artifact",
        action: "allow",
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("builds OpenCode session rules from effective permissions", () => {
    const rules = buildOpenCodeSessionPermissions({
      mcpServers: [
        { name: "github", enabled: true, action: "allow" },
        { name: "jira", enabled: false, action: "deny" },
      ],
      toolPermissions: [{ pattern: "bash_*", action: "deny" }],
      appToolPermissions: [{ pattern: "cc_app_add_secret", action: "deny" }],
    });

    expect(rules).toEqual([
      { permission: "github_*", pattern: "*", action: "allow" },
      { permission: "bash_*", pattern: "*", action: "deny" },
      { permission: "cc_app_add_secret", pattern: "*", action: "deny" },
    ]);
  });
});

async function insertAgent(
  db: AppDb,
  capabilities: Record<string, unknown>,
): Promise<typeof agents.$inferSelect> {
  const timestamp = new Date();
  const id = `agent-${crypto.randomUUID()}`;
  const [agent] = await db
    .insert(agents)
    .values({
      id,
      slug: id,
      name: "Task Agent",
      role: "help with tasks",
      instructions: "Be useful.",
      default_model: "openai/gpt-4.1",
      icon_path: null,
      status: "active",
      capabilities_json: JSON.stringify(capabilities),
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
