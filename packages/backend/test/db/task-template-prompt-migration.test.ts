import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import pino from "pino";
import { expect, it } from "vitest";
import { z } from "zod";
import { createDatabaseClient } from "../../src/db/client.js";
import { agents } from "../../src/db/schema/index.js";
import { getMigrationFolder, migrateDatabase } from "../../src/db/migrate.js";
import { writeConfigFileAtomic } from "../../src/lib/config-file.js";
import { loadRuntimeConfig } from "../../src/lib/runtime-config.js";
import { createTaskService, taskTemplateReconciler } from "../../src/services/task-service.js";
import { taskTemplateFoldersMigration } from "../../src/workspace-migrations/migrations/0011-task-template-folders.js";

it("upgrades a populated legacy database using the migrated prompt file", async () => {
  const cwd = await mkdtemp(resolve(tmpdir(), "cc-template-upgrade-"));
  const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
  const client = createDatabaseClient(config);
  const logger = pino({ enabled: false });
  try {
    const previous = resolve(cwd, "previous-migrations");
    await cp(getMigrationFolder(), previous, { recursive: true });
    const journalPath = resolve(previous, "meta/_journal.json");
    const journal = z
      .object({ entries: z.array(z.object({ idx: z.number() }).passthrough()) })
      .passthrough()
      .parse(JSON.parse(await readFile(journalPath, "utf8")));
    journal.entries = journal.entries.filter((entry) => entry.idx < 41);
    await writeFile(journalPath, JSON.stringify(journal));
    migrateDatabase(client.db, previous);
    await client.db.insert(agents).values({
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
    client.db.run(
      "INSERT INTO task_templates (id, agent_id, title, description, todos_json, status, enabled, archived, created_at, updated_at) VALUES ('template', 'specialist', 'Template', 'Old DB prompt', '[]', 'enabled', 1, 0, 0, 0)",
    );
    await writeConfigFileAtomic(
      resolve(config.paths.subdirectories.configuration, "task-templates/template.json"),
      {
        version: 1,
        id: "template",
        defaultAgentId: "specialist",
        title: "Template",
        description: "Authoritative file prompt\n",
        fallbackModels: [],
        todos: [],
        recurrence: null,
        permissionProfile: null,
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    );
    await taskTemplateFoldersMigration.up({ config, logger });
    migrateDatabase(client.db);
    await taskTemplateReconciler.reconcile({ config, db: client.db, logger });
    const task = await createTaskService({ config, db: client.db }).createTaskFromTemplate(
      "template",
    );
    expect(task?.description).toBe("Authoritative file prompt\n");
  } finally {
    client.close();
    await rm(cwd, { recursive: true, force: true });
  }
});
