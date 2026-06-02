import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { agents, task_templates } from "../../src/db/schema/index";
import { createAgentService } from "../../src/services/agent-service";
import { agentReconciler, agentFilePath } from "../../src/services/agent-file";
import { createTaskService } from "../../src/services/task-service";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

const logger = { warn: () => {}, debug: () => {}, error: () => {} } as never;

function createMockOpenCodeService(): OpenCodeService {
  return {
    dispose: vi.fn(() => Promise.resolve()),
    disposeGlobal: vi.fn(() => Promise.resolve()),
  } as unknown as OpenCodeService;
}

function makeService(testDb: Awaited<ReturnType<typeof createTestDatabase>>) {
  return createAgentService({
    db: testDb.client.db,
    config: testDb.config,
    opencodeService: createMockOpenCodeService(),
  });
}

const baseCreate = {
  role: "review code",
  instructions: "Review diffs and call out risks.",
  defaultModel: "openai/gpt-4.1",
  capabilities: {
    builtInSkills: [],
    workspaceSkills: [],
    customTools: [],
    mcpServers: [],
    toolPermissions: [],
    appMcpServers: [],
    appToolPermissions: [],
  },
};

async function readAgentJson(testDb: Awaited<ReturnType<typeof createTestDatabase>>, slug: string) {
  return JSON.parse(await readFile(agentFilePath(testDb.config, slug, "active"), "utf8")) as {
    version: number;
    id: string;
    name: string;
    role: string;
    instructions: string;
    defaultModel: string;
    capabilities: { builtInSkills: string[] };
  };
}

// ---------------------------------------------------------------------------
// Write-through
// ---------------------------------------------------------------------------

describe("agent.json write-through", () => {
  it("create writes agent.json matching the returned agent", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      const agent = await service.create({ name: "Reviewer", ...baseCreate });
      const file = await readAgentJson(testDb, agent.slug);

      expect(file.version).toBe(1);
      expect(file.id).toBe(agent.id);
      expect(file.name).toBe("Reviewer");
      expect(file.defaultModel).toBe("openai/gpt-4.1");
    } finally {
      await testDb.cleanup();
    }
  });

  it("update rewrites agent.json with new values", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      const agent = await service.create({ name: "Reviewer", ...baseCreate });
      await service.update(agent.id, { instructions: "Updated instructions." });

      const file = await readAgentJson(testDb, agent.slug);
      expect(file.id).toBe(agent.id);
      expect(file.instructions).toBe("Updated instructions.");
    } finally {
      await testDb.cleanup();
    }
  });

  it("update preserves AGENTS.md by default but rewrites it when rewriteAgentsMd is true", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      const agent = await service.create({ name: "Reviewer", ...baseCreate });
      const rulesPath = join(agent.workspacePath, "AGENTS.md");
      const original = await readFile(rulesPath, "utf8");
      expect(original).toContain("Review diffs and call out risks.");

      // Default: AGENTS.md preserved even though instructions changed.
      await service.update(agent.id, { instructions: "Brand new instructions." });
      expect(await readFile(rulesPath, "utf8")).toBe(original);
      // But agent.json (the source) did update.
      expect((await readAgentJson(testDb, agent.slug)).instructions).toBe(
        "Brand new instructions.",
      );

      // Opt-in: AGENTS.md is rewritten.
      await service.update(agent.id, {
        instructions: "Rewritten instructions.",
        rewriteAgentsMd: true,
      });
      expect(await readFile(rulesPath, "utf8")).toContain("Rewritten instructions.");
    } finally {
      await testDb.cleanup();
    }
  });

  it("update with rename moves agent.json and keeps the id", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      const agent = await service.create({ name: "Reviewer", ...baseCreate });
      const updated = await service.update(agent.id, { name: "Auditor" });

      expect(updated?.slug).toBe("auditor");
      // Old slug file is gone, new slug file exists with the same id.
      await expect(stat(agentFilePath(testDb.config, "reviewer", "active"))).rejects.toThrow();
      const file = await readAgentJson(testDb, "auditor");
      expect(file.id).toBe(agent.id);
    } finally {
      await testDb.cleanup();
    }
  });

  it("archive keeps agent.json under .archived with the same id", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      const agent = await service.create({ name: "Reviewer", ...baseCreate });
      await service.archive(agent.id);

      const archived = JSON.parse(
        await readFile(agentFilePath(testDb.config, agent.slug, "archived"), "utf8"),
      ) as { id: string };
      expect(archived.id).toBe(agent.id);
    } finally {
      await testDb.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Boot reconciler
// ---------------------------------------------------------------------------

describe("agentReconciler", () => {
  it("CC-native round-trip: restores an identical row after a DB wipe", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      const agent = await service.create({
        name: "Reviewer",
        ...baseCreate,
        capabilities: {
          ...baseCreate.capabilities,
          toolPermissions: [{ pattern: "task_*", action: "allow" }],
        },
      });

      await testDb.client.db.delete(agents);
      expect(await service.list()).toHaveLength(0);

      await agentReconciler.reconcile({ config: testDb.config, db: testDb.client.db, logger });

      const [restored] = await service.list();
      expect(restored?.id).toBe(agent.id);
      expect(restored?.slug).toBe("reviewer");
      expect(restored?.defaultModel).toBe("openai/gpt-4.1");
      expect(restored?.capabilities.toolPermissions).toEqual([
        { pattern: "task_*", action: "allow" },
      ]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("infers an OpenCode-style folder (AGENTS.md + opencode.jsonc) and writes agent.json", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      const dir = join(testDb.config.paths.subdirectories.agents, "dropped");
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "AGENTS.md"),
        "# Dropped Agent\n\n- Role: helper\n\n## Instructions\n\nBe helpful.\n",
        "utf8",
      );
      await writeFile(
        join(dir, "opencode.jsonc"),
        JSON.stringify({ model: "openai/gpt-4.1" }),
        "utf8",
      );

      await agentReconciler.reconcile({ config: testDb.config, db: testDb.client.db, logger });

      const agent = await service.getBySlug("dropped");
      expect(agent?.name).toBe("Dropped Agent");
      expect(agent?.role).toBe("helper");
      expect(agent?.instructions).toContain("Be helpful.");
      expect(agent?.defaultModel).toBe("openai/gpt-4.1");

      // agent.json was generated so the next boot is CC-native.
      const file = await readAgentJson(testDb, "dropped");
      expect(file.id).toBe(agent?.id);
    } finally {
      await testDb.cleanup();
    }
  });

  it("makes a plain empty folder into a usable agent with placeholders", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      await mkdir(join(testDb.config.paths.subdirectories.agents, "scratch"), { recursive: true });

      await agentReconciler.reconcile({ config: testDb.config, db: testDb.client.db, logger });

      const agent = await service.getBySlug("scratch");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("scratch");
      expect(agent?.role.length).toBeGreaterThan(0);
      expect(agent?.defaultModel.length).toBeGreaterThan(0);
      // mapAgent (agentSchema) did not throw — listing works.
      expect(await service.list()).toHaveLength(1);
    } finally {
      await testDb.cleanup();
    }
  });

  it("deletes rows whose source folder is gone", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      const agent = await service.create({ name: "Reviewer", ...baseCreate });
      await rm(agent.workspacePath, { recursive: true, force: true });

      await agentReconciler.reconcile({ config: testDb.config, db: testDb.client.db, logger });

      expect(await service.list()).toHaveLength(0);
    } finally {
      await testDb.cleanup();
    }
  });

  it("keeps identity stable across a folder rename (matches on id)", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      const agent = await service.create({ name: "Reviewer", ...baseCreate });
      const oldPath = join(testDb.config.paths.subdirectories.agents, "reviewer");
      const newPath = join(testDb.config.paths.subdirectories.agents, "renamed");
      await rename(oldPath, newPath);

      await agentReconciler.reconcile({ config: testDb.config, db: testDb.client.db, logger });

      const rows = await service.list();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(agent.id);
      expect(rows[0]?.slug).toBe("renamed");
    } finally {
      await testDb.cleanup();
    }
  });

  it("reconciles archived folders with archived status", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      const agent = await service.create({ name: "Reviewer", ...baseCreate });
      await service.archive(agent.id);
      await testDb.client.db.delete(agents);

      await agentReconciler.reconcile({ config: testDb.config, db: testDb.client.db, logger });

      const [restored] = await service.list(true);
      expect(restored?.id).toBe(agent.id);
      expect(restored?.status).toBe("archived");
    } finally {
      await testDb.cleanup();
    }
  });

  it("is idempotent — running twice yields one row", async () => {
    const testDb = await createTestDatabase();
    const service = makeService(testDb);

    try {
      await service.create({ name: "Reviewer", ...baseCreate });
      await testDb.client.db.delete(agents);

      await agentReconciler.reconcile({ config: testDb.config, db: testDb.client.db, logger });
      await agentReconciler.reconcile({ config: testDb.config, db: testDb.client.db, logger });

      expect(await service.list()).toHaveLength(1);
    } finally {
      await testDb.cleanup();
    }
  });

  it("is a no-op when the agents root does not exist", async () => {
    const testDb = await createTestDatabase();

    try {
      await rm(testDb.config.paths.subdirectories.agents, { recursive: true, force: true });
      await agentReconciler.reconcile({ config: testDb.config, db: testDb.client.db, logger });
      expect(await testDb.client.db.select().from(agents)).toHaveLength(0);
    } finally {
      await testDb.cleanup();
    }
  });

  it("FK ordering: agents reconcile before task_templates so agent_id resolves on a fresh DB", async () => {
    const testDb = await createTestDatabase();
    const agentService = makeService(testDb);
    const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
    const { taskTemplateReconciler } = await import("../../src/services/task-service");

    try {
      const agent = await agentService.create({ name: "Reviewer", ...baseCreate });
      await taskService.createTemplate({
        defaultAgentId: agent.id,
        title: "Nightly review",
        description: "",
      });

      // Fresh DB: wipe both derived caches.
      await testDb.client.db.delete(task_templates);
      await testDb.client.db.delete(agents);

      // Reconcile in boot order.
      await agentReconciler.reconcile({ config: testDb.config, db: testDb.client.db, logger });
      await taskTemplateReconciler.reconcile({
        config: testDb.config,
        db: testDb.client.db,
        logger,
      });

      const [template] = await taskService.listTemplates();
      expect(template?.defaultAgentId).toBe(agent.id);
      expect(await agentService.get(agent.id)).toBeDefined();
    } finally {
      await testDb.cleanup();
    }
  });
});
