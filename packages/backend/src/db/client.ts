import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import type { RuntimeConfig } from "../lib/runtime-config.js";
import * as schema from "./schema/index.js";

export type AppSchema = typeof schema;
export type AppDb = BetterSQLite3Database<AppSchema>;

export type DatabaseClient = {
  db: AppDb;
  dialect: "sqlite";
  sqlitePath: string;
  close(): void;
};

export function createDatabaseClient(config: RuntimeConfig): DatabaseClient {
  mkdirSync(dirname(config.database.sqlitePath), { recursive: true });

  const sqlite = new Database(config.database.sqlitePath);
  const db = drizzle(sqlite, { schema });

  return {
    db,
    dialect: "sqlite",
    sqlitePath: config.database.sqlitePath,
    close() {
      sqlite.close();
    },
  };
}
