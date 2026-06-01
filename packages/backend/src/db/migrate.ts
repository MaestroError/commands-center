import { resolve } from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { AppDb } from "./client.js";

type SqliteClient = {
  pragma(statement: string): unknown;
};

export function getMigrationFolder(): string {
  return resolve(import.meta.dirname, "migrations");
}

export function migrateDatabase(db: AppDb, migrationsFolder = getMigrationFolder()): void {
  const sqlite = (db as AppDb & { $client?: SqliteClient }).$client;

  if (!sqlite) {
    migrate(db, {
      migrationsFolder,
    });
    return;
  }

  sqlite.pragma("foreign_keys = OFF");

  try {
    migrate(db, {
      migrationsFolder,
    });
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}
