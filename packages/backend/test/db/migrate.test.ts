import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createDatabaseClient } from "../../src/db/client";
import { migrateDatabase } from "../../src/db/migrate";
import { loadRuntimeConfig } from "../../src/lib/runtime-config";

type SqliteClient = {
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
};

describe("migrateDatabase", () => {
  it("creates board task schema objects on a fresh sqlite database", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-migrate-db-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    await mkdir(config.paths.subdirectories.database, { recursive: true });

    const client = createDatabaseClient(config);
    const sqlite = (client.db as typeof client.db & { $client: SqliteClient }).$client;

    try {
      migrateDatabase(client.db);

      expect(columnExists(sqlite, "task_templates", "default_agent_id")).toBe(true);
      expect(columnExists(sqlite, "task_templates", "recurrence_json")).toBe(true);
      expect(columnExists(sqlite, "tasks", "default_agent_id")).toBe(true);
      expect(columnExists(sqlite, "tasks", "source_template_id")).toBe(true);
      expect(tableExists(sqlite, "task_subtasks")).toBe(true);
      expect(tableExists(sqlite, "task_feedback")).toBe(true);
      expect(columnExists(sqlite, "task_subtasks", "agent_id")).toBe(true);
      expect(columnExists(sqlite, "task_runs", "subtask_id")).toBe(true);
      expect(columnExists(sqlite, "task_runs", "outcome")).toBe(true);
      expect(indexExists(sqlite, "tasks_default_agent_id_idx")).toBe(true);
      expect(indexExists(sqlite, "task_runs_subtask_id_idx")).toBe(true);
    } finally {
      client.close();
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

function tableExists(sqlite: SqliteClient, tableName: string): boolean {
  return Boolean(
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get(tableName),
  );
}

function columnExists(sqlite: SqliteClient, tableName: string, columnName: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: unknown }>;
  return rows.some((row) => row.name === columnName);
}

function indexExists(sqlite: SqliteClient, indexName: string): boolean {
  return Boolean(
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1")
      .get(indexName),
  );
}
