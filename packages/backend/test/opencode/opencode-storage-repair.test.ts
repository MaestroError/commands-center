import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  repairOpenCodeStorage,
  resolveOpenCodeDatabasePath,
} from "../../src/opencode/opencode-storage-repair";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("repairOpenCodeStorage", () => {
  it("adds missing session context epoch columns to an existing opencode database", async () => {
    const root = await createTempRoot();
    const dbPath = join(root, "share", "opencode", "opencode.db");
    await createOldContextEpochDatabase(dbPath);

    const result = repairOpenCodeStorage({
      env: { XDG_DATA_HOME: join(root, "share") },
    });

    expect(result).toEqual({
      dbPath,
      repairedColumns: ["replacement_seq", "revision", "agent"],
    });
    expect(readColumns(dbPath, "session_context_epoch")).toEqual(
      expect.arrayContaining(["replacement_seq", "revision", "agent"]),
    );
  });

  it("does not change a database that already has the expected columns", async () => {
    const root = await createTempRoot();
    const dbPath = join(root, "share", "opencode", "opencode.db");
    await createCurrentContextEpochDatabase(dbPath);

    const result = repairOpenCodeStorage({
      env: { XDG_DATA_HOME: join(root, "share") },
    });

    expect(result).toEqual({ dbPath, repairedColumns: [] });
  });

  it("skips missing opencode databases", async () => {
    const root = await createTempRoot();
    const dbPath = join(root, "share", "opencode", "opencode.db");

    const result = repairOpenCodeStorage({
      env: { XDG_DATA_HOME: join(root, "share") },
    });

    expect(result).toEqual({
      dbPath,
      repairedColumns: [],
      skippedReason: "missing_database",
    });
  });

  it("skips databases without the session context epoch table", async () => {
    const root = await createTempRoot();
    const dbPath = join(root, "share", "opencode", "opencode.db");
    await createDatabase(dbPath, (sqlite) => {
      sqlite.exec("CREATE TABLE session (id text PRIMARY KEY)");
    });

    const result = repairOpenCodeStorage({
      env: { XDG_DATA_HOME: join(root, "share") },
    });

    expect(result).toEqual({
      dbPath,
      repairedColumns: [],
      skippedReason: "missing_table",
    });
  });

  it("resolves custom absolute and relative OPENCODE_DB paths", async () => {
    const root = await createTempRoot();
    const absolutePath = join(root, "custom.db");

    expect(resolveOpenCodeDatabasePath({ OPENCODE_DB: absolutePath })).toBe(absolutePath);
    expect(
      resolveOpenCodeDatabasePath({
        XDG_DATA_HOME: join(root, "share"),
        OPENCODE_DB: "channel.db",
      }),
    ).toBe(join(root, "share", "opencode", "channel.db"));
  });

  it("skips in-memory opencode databases", () => {
    expect(repairOpenCodeStorage({ env: { OPENCODE_DB: ":memory:" } })).toEqual({
      repairedColumns: [],
      skippedReason: "memory_database",
    });
  });
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cc-opencode-repair-"));
  tempRoots.push(root);
  return root;
}

async function createOldContextEpochDatabase(dbPath: string): Promise<void> {
  await createDatabase(dbPath, (sqlite) => {
    sqlite.exec(`
      CREATE TABLE session_context_epoch (
        session_id text PRIMARY KEY,
        baseline text NOT NULL,
        snapshot text NOT NULL,
        baseline_seq integer NOT NULL
      )
    `);
  });
}

async function createCurrentContextEpochDatabase(dbPath: string): Promise<void> {
  await createDatabase(dbPath, (sqlite) => {
    sqlite.exec(`
      CREATE TABLE session_context_epoch (
        session_id text PRIMARY KEY,
        baseline text NOT NULL,
        snapshot text NOT NULL,
        baseline_seq integer NOT NULL,
        replacement_seq integer,
        revision integer DEFAULT 0 NOT NULL,
        agent text DEFAULT 'build' NOT NULL
      )
    `);
  });
}

async function createDatabase(
  dbPath: string,
  setup: (sqlite: Database.Database) => void,
): Promise<void> {
  await mkdir(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  try {
    setup(sqlite);
  } finally {
    sqlite.close();
  }
}

function readColumns(dbPath: string, tableName: string): string[] {
  const sqlite = new Database(dbPath, { readonly: true });
  try {
    return sqlite
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((row) => (row as { name: string }).name);
  } finally {
    sqlite.close();
  }
}
