import { mkdtemp, rm } from "node:fs/promises";
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
      expect(tableExists(sqlite, "documents")).toBe(true);
      expect(columnExists(sqlite, "documents", "id")).toBe(true);
      expect(columnExists(sqlite, "documents", "relative_path")).toBe(true);
      expect(columnExists(sqlite, "documents", "author")).toBe(true);
      expect(columnExists(sqlite, "documents", "title")).toBe(true);
      expect(columnExists(sqlite, "documents", "description")).toBe(true);
      expect(columnExists(sqlite, "documents", "created_at")).toBe(true);
      expect(columnExists(sqlite, "documents", "updated_at")).toBe(true);
      expect(columnExists(sqlite, "documents", "last_seen_at")).toBe(true);
      expect(indexExists(sqlite, "documents_relative_path_unique")).toBe(true);
      expect(tableExists(sqlite, "task_run_followups")).toBe(true);
      expect(columnExists(sqlite, "task_subtasks", "agent_id")).toBe(true);
      expect(columnExists(sqlite, "task_runs", "subtask_id")).toBe(true);
      expect(columnExists(sqlite, "task_runs", "outcome")).toBe(true);
      expect(columnExists(sqlite, "task_runs", "review_question_json")).toBe(true);
      expect(columnExists(sqlite, "task_run_followups", "run_id")).toBe(true);
      expect(columnExists(sqlite, "task_run_followups", "status")).toBe(true);
      expect(indexExists(sqlite, "tasks_default_agent_id_idx")).toBe(true);
      expect(indexExists(sqlite, "task_runs_subtask_id_idx")).toBe(true);
      expect(indexExists(sqlite, "task_run_followups_run_status_idx")).toBe(true);
      expect(tableExists(sqlite, "automations")).toBe(false);
      expect(tableExists(sqlite, "automation_runs")).toBe(false);
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
