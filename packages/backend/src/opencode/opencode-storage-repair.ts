import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

import Database from "better-sqlite3";
import type { Logger } from "pino";

const OPENCODE_APP_DIR = "opencode";
const OPENCODE_DB_FILE = "opencode.db";
const CONTEXT_EPOCH_TABLE = "session_context_epoch";

type SqliteColumn = {
  name: string;
};

export type OpenCodeStorageRepairResult = {
  dbPath?: string;
  repairedColumns: string[];
  skippedReason?: "memory_database" | "missing_database" | "missing_table";
};

export function resolveOpenCodeDatabasePath(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const configuredDb = env["OPENCODE_DB"]?.trim();
  if (configuredDb === ":memory:") {
    return undefined;
  }

  const dataRoot = resolveOpenCodeDataRoot(env);
  if (configuredDb) {
    return isAbsolute(configuredDb) ? configuredDb : join(dataRoot, configuredDb);
  }

  return join(dataRoot, OPENCODE_DB_FILE);
}

export function repairOpenCodeStorage(options?: {
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Logger, "info">;
}): OpenCodeStorageRepairResult {
  const dbPath = resolveOpenCodeDatabasePath(options?.env);
  if (!dbPath) {
    return { repairedColumns: [], skippedReason: "memory_database" };
  }

  if (!existsSync(dbPath)) {
    return { dbPath, repairedColumns: [], skippedReason: "missing_database" };
  }

  const sqlite = new Database(dbPath);
  try {
    if (!tableExists(sqlite, CONTEXT_EPOCH_TABLE)) {
      return { dbPath, repairedColumns: [], skippedReason: "missing_table" };
    }

    const columns = new Set(
      sqlite
        .prepare(`PRAGMA table_info(${CONTEXT_EPOCH_TABLE})`)
        .all()
        .map((column) => (column as SqliteColumn).name),
    );
    const repairedColumns: string[] = [];

    addColumnIfMissing(sqlite, columns, repairedColumns, "replacement_seq", "integer");
    addColumnIfMissing(sqlite, columns, repairedColumns, "revision", "integer DEFAULT 0 NOT NULL");
    addColumnIfMissing(sqlite, columns, repairedColumns, "agent", "text DEFAULT 'build' NOT NULL");

    if (repairedColumns.length > 0) {
      options?.logger?.info(
        { dbPath, columns: repairedColumns },
        "repaired opencode storage schema",
      );
    }

    return { dbPath, repairedColumns };
  } finally {
    sqlite.close();
  }
}

function resolveOpenCodeDataRoot(env: NodeJS.ProcessEnv): string {
  const configuredDataHome = env["XDG_DATA_HOME"]?.trim();
  if (configuredDataHome) {
    return join(configuredDataHome, OPENCODE_APP_DIR);
  }

  const home = env["HOME"]?.trim() || homedir();
  return join(home, ".local", "share", OPENCODE_APP_DIR);
}

function tableExists(sqlite: Database.Database, tableName: string): boolean {
  return Boolean(
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get(tableName),
  );
}

function addColumnIfMissing(
  sqlite: Database.Database,
  columns: Set<string>,
  repairedColumns: string[],
  columnName: string,
  columnDefinition: string,
): void {
  if (columns.has(columnName)) {
    return;
  }

  sqlite.exec(`ALTER TABLE ${CONTEXT_EPOCH_TABLE} ADD COLUMN ${columnName} ${columnDefinition}`);
  columns.add(columnName);
  repairedColumns.push(columnName);
}
