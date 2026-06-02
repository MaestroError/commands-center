import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const api_tokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    token_hash: text("token_hash").notNull(),
    token_prefix: text("token_prefix").notNull(),
    scopes_json: text("scopes_json").notNull(),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    last_used_at: integer("last_used_at", { mode: "timestamp_ms" }),
    revoked_at: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => ({
    apiTokensTokenHashUnique: uniqueIndex("api_tokens_token_hash_unique").on(table.token_hash),
  }),
);
