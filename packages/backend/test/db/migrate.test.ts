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
    run(...params: unknown[]): unknown;
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
      expect(columnExists(sqlite, "documents", "scope")).toBe(true);
      expect(columnExists(sqlite, "documents", "owner_slug")).toBe(true);
      expect(columnExists(sqlite, "documents", "owner_specialist_id")).toBe(true);
      expect(columnExists(sqlite, "documents", "created_at")).toBe(true);
      expect(columnExists(sqlite, "documents", "updated_at")).toBe(true);
      expect(columnExists(sqlite, "documents", "last_seen_at")).toBe(true);
      expect(indexExists(sqlite, "documents_global_relative_path_unique")).toBe(true);
      expect(indexExists(sqlite, "documents_private_owner_path_unique")).toBe(true);
      expect(indexWhere(sqlite, "documents_private_owner_path_unique")).toBe(
        '"documents"."scope" = \'private\' and "documents"."owner_specialist_id" is not null',
      );
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
      expect(tableExists(sqlite, "oauth_records")).toBe(true);
      expect(indexExists(sqlite, "oauth_records_model_grant_id_idx")).toBe(true);
      expect(indexExists(sqlite, "oauth_records_model_expires_at_idx")).toBe(true);
      expect(tableExists(sqlite, "automations")).toBe(false);
      expect(tableExists(sqlite, "automation_runs")).toBe(false);
    } finally {
      client.close();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("enforces scoped document uniqueness", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-migrate-db-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });

    const client = createDatabaseClient(config);
    const sqlite = (client.db as typeof client.db & { $client: SqliteClient }).$client;

    try {
      migrateDatabase(client.db);

      insertDocument(sqlite, {
        id: "global-1",
        scope: "global",
        ownerSlug: null,
        ownerSpecialistId: null,
        relativePath: "notes/shared.md",
      });
      expect(() =>
        insertDocument(sqlite, {
          id: "global-duplicate",
          scope: "global",
          ownerSlug: null,
          ownerSpecialistId: null,
          relativePath: "notes/shared.md",
        }),
      ).toThrow();

      insertDocument(sqlite, {
        id: "private-1",
        scope: "private",
        ownerSlug: "planner",
        ownerSpecialistId: "agent-planner",
        relativePath: "notes/shared.md",
      });
      expect(() =>
        insertDocument(sqlite, {
          id: "private-duplicate",
          scope: "private",
          ownerSlug: "planner",
          ownerSpecialistId: "agent-planner",
          relativePath: "notes/shared.md",
        }),
      ).toThrow();
      insertDocument(sqlite, {
        id: "private-other-owner",
        scope: "private",
        ownerSlug: "researcher",
        ownerSpecialistId: "agent-researcher",
        relativePath: "notes/shared.md",
      });
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

function indexWhere(sqlite: SqliteClient, indexName: string): string | undefined {
  const row = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1")
    .get(indexName) as { sql?: string } | undefined;
  return row?.sql?.match(/\sWHERE\s(.+)$/i)?.[1];
}

function insertDocument(
  sqlite: SqliteClient,
  input: {
    id: string;
    scope: string;
    ownerSlug: string | null;
    ownerSpecialistId: string | null;
    relativePath: string;
  },
): void {
  sqlite
    .prepare(
      [
        "INSERT INTO documents",
        "(id, scope, owner_slug, owner_specialist_id, relative_path, created_at, updated_at, last_seen_at)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ].join(" "),
    )
    .run(
      input.id,
      input.scope,
      input.ownerSlug,
      input.ownerSpecialistId,
      input.relativePath,
      1,
      1,
      1,
    );
}
