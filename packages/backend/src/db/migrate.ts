import { resolve } from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { AppDb } from "./client.js";

export function getMigrationFolder(): string {
  return resolve(import.meta.dirname, "migrations");
}

export function migrateDatabase(db: AppDb, migrationsFolder = getMigrationFolder()): void {
  migrate(db, {
    migrationsFolder,
  });
}
