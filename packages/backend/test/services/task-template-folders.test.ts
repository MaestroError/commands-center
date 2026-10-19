import { loadRuntimeConfig } from "../../src/lib/runtime-config.js";
import { taskTemplateFoldersMigration } from "../../src/workspace-migrations/migrations/0011-task-template-folders.js";
import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { eq } from "drizzle-orm";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agents, task_templates } from "../../src/db/schema/index.js";
import { createTaskService } from "../../src/services/task-service.js";
import {
  taskTemplateReconciler,
  templateFilePath,
} from "../../src/services/task-service/template-files.js";
import { createTestDatabase } from "../helpers/db.js";

describe("file-backed task template prompts", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let service: ReturnType<typeof createTaskService>;
  beforeEach(async () => {
    database = await createTestDatabase();
    await database.client.db.insert(agents).values({
      id: "specialist",
      slug: "specialist",
      name: "Specialist",
      role: "Test",
      instructions: "Test",
      default_model: "openai/test",
      status: "active",
      capabilities_json: "{}",
      created_at: new Date(),
      updated_at: new Date(),
    });
    service = createTaskService({ db: database.client.db, config: database.config });
  });
  afterEach(async () => database.cleanup());

  async function create() {
    return service.createTemplate({
      defaultAgentId: "specialist",
      title: "Template",
      description: "# Original\n\nKeep whitespace.\n",
      fallbackModels: [],
      todos: [],
    });
  }

  it("keeps the prompt out of template settings", async () => {
    const template = await create();
    const settings = JSON.parse(
      await readFile(templateFilePath(database.config, template.id), "utf8"),
    ) as Record<string, unknown>;
    expect(settings).toMatchObject({ version: 2, promptPath: template.promptPath });
    expect(settings).not.toHaveProperty("description");
  });

  it("stores only a resolved prompt path in the template database row", async () => {
    const template = await create();
    const row = await database.client.db.query.task_templates.findFirst();
    expect(row?.prompt_path).toBe(resolve(database.config.paths.workspaceDir, template.promptPath));
    expect(row).not.toHaveProperty("description");
  });

  it("preserves exact Markdown whitespace", async () => {
    const template = await create();
    expect(
      await readFile(resolve(database.config.paths.workspaceDir, template.promptPath), "utf8"),
    ).toBe("# Original\n\nKeep whitespace.\n");
  });

  it.each(["manual", "scheduled", "api", "agent"] as const)(
    "snapshots live Markdown for %s generation",
    async (triggerSource) => {
      const template = await create();
      await writeFile(
        resolve(database.config.paths.workspaceDir, template.promptPath),
        "# Edited externally\n",
      );
      const task = await service.createTaskFromTemplate(template.id, { triggerSource });
      expect(task?.description).toBe("# Edited externally\n");
    },
  );

  it("preserves existing generated task snapshots after file edits", async () => {
    const template = await create();
    const task = await service.createTaskFromTemplate(template.id);
    await writeFile(resolve(database.config.paths.workspaceDir, template.promptPath), "New prompt");
    expect((await service.get(task!.id))?.description).toBe(template.description);
  });

  it("reads external prompt edits when fetching a template", async () => {
    const template = await create();
    await writeFile(resolve(database.config.paths.workspaceDir, template.promptPath), "New prompt");
    expect((await service.getTemplate(template.id))?.description).toBe("New prompt");
  });

  it("does not overwrite Markdown during settings-only updates", async () => {
    const template = await create();
    await writeFile(resolve(database.config.paths.workspaceDir, template.promptPath), "New prompt");
    await service.updateTemplate(template.id, { title: "New title" });
    expect((await service.getTemplate(template.id))?.description).toBe("New prompt");
  });

  it("rejects stale prompt edits", async () => {
    const template = await create();
    await writeFile(resolve(database.config.paths.workspaceDir, template.promptPath), "New prompt");
    await expect(
      service.updateTemplate(template.id, {
        description: "Stale",
        expectedPromptRevision: template.promptRevision,
      }),
    ).rejects.toThrow("changed on disk");
    expect((await service.getTemplate(template.id))?.description).toBe("New prompt");
  });

  it("accepts prompt edits using the current revision", async () => {
    const template = await create();
    const updated = await service.updateTemplate(template.id, {
      description: "Updated\n",
      expectedPromptRevision: template.promptRevision,
    });
    expect(updated?.description).toBe("Updated\n");
  });

  it("fails generation when the Markdown file is missing", async () => {
    const template = await create();
    await rm(resolve(database.config.paths.workspaceDir, template.promptPath));
    await expect(service.createTaskFromTemplate(template.id)).rejects.toThrow(
      "Template prompt is missing",
    );
    expect(await service.list()).toHaveLength(0);
  });

  it("rebuilds template settings from portable files", async () => {
    const template = await create();
    await database.client.db.delete(task_templates).where(eq(task_templates.id, template.id));
    await taskTemplateReconciler.reconcile({
      config: database.config,
      db: database.client.db,
      logger: pino({ enabled: false }),
    });
    expect((await service.getTemplate(template.id))?.description).toBe(template.description);
  });

  it("resolves the prompt after moving the workspace", async () => {
    const template = await create();
    const relocated = resolve(database.cwd, "relocated");
    await cp(database.config.paths.workspaceDir, relocated, { recursive: true });
    await rm(database.config.paths.workspaceDir, { recursive: true });
    const config = loadRuntimeConfig({
      cwd: database.cwd,
      env: { NODE_ENV: "test", CC_WORKSPACE_DIR: relocated },
    });
    await taskTemplateReconciler.reconcile({
      config,
      db: database.client.db,
      logger: pino({ enabled: false }),
    });
    const restoredService = createTaskService({ db: database.client.db, config });
    expect((await restoredService.createTaskFromTemplate(template.id))?.description).toBe(
      template.description,
    );
  });

  it("rebuilds a migrated legacy template without a database prompt", async () => {
    const template = await create();
    const settings = JSON.parse(
      await readFile(templateFilePath(database.config, template.id), "utf8"),
    ) as Record<string, unknown>;
    delete settings["promptPath"];
    const folder = dirname(templateFilePath(database.config, template.id));
    await rm(folder, { recursive: true });
    await writeFile(
      `${folder}.json`,
      JSON.stringify({ ...settings, version: 1, description: template.description }),
    );
    await database.client.db.delete(task_templates);
    await taskTemplateFoldersMigration.up({
      config: database.config,
      logger: pino({ enabled: false }),
    });
    await taskTemplateReconciler.reconcile({
      config: database.config,
      db: database.client.db,
      logger: pino({ enabled: false }),
    });
    expect((await service.createTaskFromTemplate(template.id))?.description).toBe(
      template.description,
    );
  });

  it("refuses prompt symlinks escaping the workspace", async () => {
    const template = await create();
    const path = resolve(database.config.paths.workspaceDir, template.promptPath);
    const outside = resolve(database.cwd, "outside.md");
    await writeFile(outside, "Outside");
    await rm(path);
    await symlink(outside, path);
    await expect(service.createTaskFromTemplate(template.id)).rejects.toThrow(
      "inside the workspace",
    );
  });

  it("preserves extra assets on settings updates", async () => {
    const template = await create();
    const context = resolve(
      dirname(templateFilePath(database.config, template.id)),
      "context",
      "notes.md",
    );
    await mkdir(dirname(context), { recursive: true });
    await writeFile(context, "Notes");
    await service.disableTemplate(template.id);
    expect(await readFile(context, "utf8")).toBe("Notes");
  });

  it("deletes the template folder with the template", async () => {
    const template = await create();
    await service.delete(template.id);
    await expect(
      readFile(resolve(database.config.paths.workspaceDir, template.promptPath)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
