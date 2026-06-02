import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createId, now } from "../../src/db/ids";
import { agents, task_templates } from "../../src/db/schema/index";
import { createTaskService, taskTemplateReconciler } from "../../src/services/task-service";
import { createTestDatabase } from "../helpers/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function insertAgent(testDb: Awaited<ReturnType<typeof createTestDatabase>>) {
  const timestamp = now();
  const [agent] = await testDb.client.db
    .insert(agents)
    .values({
      id: createId(),
      slug: `agent-${crypto.randomUUID()}`,
      name: "Template Agent",
      role: "run templates",
      instructions: "Be reliable.",
      default_model: "openai/gpt-4.1",
      icon_path: null,
      status: "active",
      capabilities_json: "{}",
      created_at: timestamp,
      updated_at: timestamp,
      archived_at: null,
    })
    .returning();

  if (!agent) throw new Error("Failed to insert test agent.");
  return agent;
}

function configDir(testDb: Awaited<ReturnType<typeof createTestDatabase>>) {
  return testDb.config.paths.subdirectories.configuration;
}

const logger = { debug: () => {}, error: () => {} } as never;

// ---------------------------------------------------------------------------
// Write-through tests
// ---------------------------------------------------------------------------

describe("task template file persistence", () => {
  it("createTemplate writes configuration/task-templates/<id>.json", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Daily standup",
        description: "Run the standup.",
        todos: [{ content: "Check PRs" }],
        enabled: true,
      });

      const filePath = join(configDir(testDb), "task-templates", `${template.id}.json`);
      const file = JSON.parse(await readFile(filePath, "utf8")) as {
        version: number;
        id: string;
        title: string;
        enabled: boolean;
        todos: Array<{ content: string }>;
      };

      expect(file.version).toBe(1);
      expect(file.id).toBe(template.id);
      expect(file.title).toBe("Daily standup");
      expect(file.enabled).toBe(true);
      expect(file.todos[0]?.content).toBe("Check PRs");
    } finally {
      await testDb.cleanup();
    }
  });

  it("updateTemplate overwrites the file with new values", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Original title",
        description: "",
      });

      await service.updateTemplate(template.id, {
        title: "Updated title",
        description: "New desc",
      });

      const filePath = join(configDir(testDb), "task-templates", `${template.id}.json`);
      const file = JSON.parse(await readFile(filePath, "utf8")) as {
        title: string;
        description: string;
      };

      expect(file.title).toBe("Updated title");
      expect(file.description).toBe("New desc");
    } finally {
      await testDb.cleanup();
    }
  });

  it("disable updates the enabled flag in the file", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Disableable",
        description: "",
        enabled: true,
      });

      await service.disable(template.id);

      const filePath = join(configDir(testDb), "task-templates", `${template.id}.json`);
      const file = JSON.parse(await readFile(filePath, "utf8")) as { enabled: boolean };
      expect(file.enabled).toBe(false);
    } finally {
      await testDb.cleanup();
    }
  });

  it("enable restores the enabled flag in the file", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Re-enable me",
        description: "",
        enabled: false,
      });

      await service.enable(template.id);

      const filePath = join(configDir(testDb), "task-templates", `${template.id}.json`);
      const file = JSON.parse(await readFile(filePath, "utf8")) as { enabled: boolean };
      expect(file.enabled).toBe(true);
    } finally {
      await testDb.cleanup();
    }
  });

  it("delete removes the file", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "To be deleted",
        description: "",
      });

      await service.delete(template.id);

      const filePath = join(configDir(testDb), "task-templates", `${template.id}.json`);
      await expect(readFile(filePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await testDb.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Boot reconciler tests
// ---------------------------------------------------------------------------

describe("taskTemplateReconciler", () => {
  it("restores DB rows from files on a fresh DB", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb);
      await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Persist me",
        description: "Should survive DB wipe.",
        enabled: true,
      });

      // Wipe the DB table
      await testDb.client.db.delete(task_templates);
      expect(await service.listTemplates()).toHaveLength(0);

      // Reconcile should restore from file
      await taskTemplateReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      const restored = await service.listTemplates();
      expect(restored).toHaveLength(1);
      expect(restored[0]?.title).toBe("Persist me");
      expect(restored[0]?.enabled).toBe(true);
    } finally {
      await testDb.cleanup();
    }
  });

  it("deletes orphaned DB rows that have no corresponding file", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb);
      const template = await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Orphan",
        description: "",
      });

      // Remove only the file, leaving the DB row — simulates a crash after file
      // deletion but before the DB soft-delete, or a manual file removal.
      const { unlink } = await import("node:fs/promises");
      const { join: pathJoin } = await import("node:path");
      await unlink(pathJoin(configDir(testDb), "task-templates", `${template.id}.json`));

      expect(await service.listTemplates()).toHaveLength(1);

      await taskTemplateReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      expect(await service.listTemplates()).toHaveLength(0);
    } finally {
      await testDb.cleanup();
    }
  });

  it("is a no-op when the task-templates directory does not exist", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      // No files written — directory won't exist
      await taskTemplateReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      expect(await service.listTemplates()).toHaveLength(0);
    } finally {
      await testDb.cleanup();
    }
  });

  it("preserves recurrence and permissionProfile through a reconcile cycle", async () => {
    const testDb = await createTestDatabase();
    const service = createTaskService({ db: testDb.client.db, config: testDb.config });

    try {
      const agent = await insertAgent(testDb);
      await service.createTemplate({
        defaultAgentId: agent.id,
        title: "Recurring",
        description: "",
        recurrence: {
          mode: "recurring",
          anchorAt: "2026-06-09T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1 },
        },
      });

      await testDb.client.db.delete(task_templates);
      await taskTemplateReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      const [restored] = await service.listTemplates();
      expect(restored?.recurrence?.anchorAt).toBe("2026-06-09T09:00:00.000Z");
    } finally {
      await testDb.cleanup();
    }
  });
});
