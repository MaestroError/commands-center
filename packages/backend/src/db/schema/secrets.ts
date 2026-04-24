import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const secrets = sqliteTable(
  "secrets",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    encrypted_value: text("encrypted_value"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    secretsKeyUnique: uniqueIndex("secrets_key_unique").on(table.key),
  }),
);
