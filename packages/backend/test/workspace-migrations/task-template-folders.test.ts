import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { taskTemplateFoldersMigration as migration } from "../../src/workspace-migrations/migrations/0011-task-template-folders.js";
import { createTestDatabase } from "../helpers/db.js";

const original = {
  version: 1,
  id: "template",
  defaultAgentId: "specialist",
  title: "Template",
  description: "# Prompt\n\nKeep this.\n",
  fallbackModels: [],
  todos: [],
  recurrence: null,
  permissionProfile: null,
  enabled: true,
  createdAt: "2026-10-19T00:00:00.000Z",
  updatedAt: "2026-10-19T00:00:00.000Z",
  extra: { preserved: true },
};

describe("task template folder migration", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let root: string;
  const logger = pino({ enabled: false });
  beforeEach(async () => {
    database = await createTestDatabase();
    root = resolve(database.config.paths.subdirectories.configuration, "task-templates");
    await mkdir(root, { recursive: true });
  });
  afterEach(async () => database.cleanup());
  async function seed() {
    await writeFile(resolve(root, "template.json"), JSON.stringify(original));
  }
  async function up() {
    await migration.up({ config: database.config, logger });
  }
  async function down() {
    await migration.down({ config: database.config, logger });
  }

  it("does nothing on a fresh workspace", async () => {
    await up();
    expect(await readdir(root)).toEqual([]);
  });
  it("extracts the exact prompt into Markdown", async () => {
    await seed();
    await up();
    expect(await readFile(resolve(root, "template/task.md"), "utf8")).toBe(original.description);
  });
  it("preserves unknown metadata", async () => {
    await seed();
    await up();
    expect(JSON.parse(await readFile(resolve(root, "template/task.json"), "utf8"))).toMatchObject({
      version: 2,
      extra: original.extra,
      promptPath: "configuration/task-templates/template/task.md",
    });
  });
  it("is idempotent", async () => {
    await seed();
    await up();
    await up();
    expect(await readdir(root)).toEqual(["template"]);
  });
  it("resumes after publishing the folder before removing the old file", async () => {
    await seed();
    await up();
    await seed();
    await up();
    expect(await readdir(root)).toEqual(["template"]);
  });
  it("rejects conflicting old and new prompt content", async () => {
    await seed();
    await up();
    await seed();
    await writeFile(resolve(root, "template/task.md"), "Changed");
    await expect(up()).rejects.toThrow("Conflicting");
    expect(await readFile(resolve(root, "template/task.md"), "utf8")).toBe("Changed");
  });
  it("rejects invalid legacy JSON without replacing it", async () => {
    await writeFile(resolve(root, "template.json"), "invalid");
    await expect(up()).rejects.toThrow();
    expect(await readFile(resolve(root, "template.json"), "utf8")).toBe("invalid");
  });
  it("rolls back using the latest Markdown content", async () => {
    await seed();
    await up();
    await writeFile(resolve(root, "template/task.md"), "New prompt");
    await down();
    expect(JSON.parse(await readFile(resolve(root, "template.json"), "utf8"))).toEqual({
      ...original,
      description: "New prompt",
    });
  });
  it("has an idempotent rollback", async () => {
    await seed();
    await up();
    await down();
    await down();
    expect(await readdir(root)).toEqual(["template.json"]);
  });
  it("does not discard extra assets on rollback", async () => {
    await seed();
    await up();
    await writeFile(resolve(root, "template/notes.md"), "Keep");
    await expect(down()).rejects.toThrow("additional assets");
    expect(await readFile(resolve(root, "template/notes.md"), "utf8")).toBe("Keep");
  });
  it("rejects rollback conflicts", async () => {
    await seed();
    await up();
    await seed();
    await writeFile(resolve(root, "template/task.md"), "Changed");
    await expect(down()).rejects.toThrow("Conflicting");
  });
  it("rejects missing Markdown during rollback", async () => {
    await seed();
    await up();
    await rm(resolve(root, "template/task.md"));
    await expect(down()).rejects.toThrow();
    expect(await readdir(root)).toEqual(["template"]);
  });
});
