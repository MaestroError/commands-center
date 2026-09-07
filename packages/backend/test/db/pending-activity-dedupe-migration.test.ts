import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let sqlite: Database.Database;

describe("pending activity dedupe migration", () => {
  beforeAll(async () => {
    sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE activities (
        id text PRIMARY KEY NOT NULL,
        kind text NOT NULL,
        level text NOT NULL,
        status text DEFAULT 'pending' NOT NULL,
        title text NOT NULL,
        body text,
        payload_json text,
        dedupe_key text,
        created_at integer NOT NULL,
        updated_at integer NOT NULL,
        archived_at integer
      );
      CREATE INDEX activities_dedupe_key_idx ON activities (dedupe_key);
      INSERT INTO activities VALUES
        ('older', 'task_completed', 'info', 'pending', 'Older', NULL, NULL, 'run:1', 1, 1, NULL),
        ('newer', 'task_completed', 'info', 'pending', 'Newer', NULL, NULL, 'run:1', 2, 2, NULL);
    `);
    const migrationSql = await readFile(
      resolve(import.meta.dirname, "../../src/db/migrations/0041_dapper_unicorn.sql"),
      "utf8",
    );
    sqlite.exec(migrationSql);
  });

  afterAll(() => sqlite.close());

  it("archives older pending duplicates before creating the unique index", () => {
    const rows = sqlite
      .prepare("SELECT id, status, archived_at FROM activities ORDER BY id")
      .all() as Array<{ id: string; status: string; archived_at: number | null }>;

    expect(rows).toEqual([
      { id: "newer", status: "pending", archived_at: null },
      { id: "older", status: "archived", archived_at: expect.any(Number) },
    ]);
  });

  it("rejects another pending activity with the same dedupe key", () => {
    expect(() =>
      sqlite
        .prepare("INSERT INTO activities VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL)")
        .run("third", "task_completed", "info", "pending", "Third", "run:1", 3, 3),
    ).toThrow(/unique/i);
  });
});
