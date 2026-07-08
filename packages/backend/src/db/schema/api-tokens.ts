import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const api_tokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    token_hash: text("token_hash").notNull(),
    token_prefix: text("token_prefix").notNull(),
    // Legacy coarse scopes. New/edited tokens write "[]" here and store the
    // granular permission set in permissions_json; kept for lazy back-compat
    // reads of pre-capability tokens.
    scopes_json: text("scopes_json").notNull(),
    // Granular per-capability + per-template permissions (JSON). Nullable: a null
    // value means the token predates the capability model and is resolved from
    // scopes_json at read time.
    permissions_json: text("permissions_json"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    last_used_at: integer("last_used_at", { mode: "timestamp_ms" }),
    revoked_at: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => ({
    apiTokensTokenHashUnique: uniqueIndex("api_tokens_token_hash_unique").on(table.token_hash),
  }),
);
