import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

// Append-only per-token request audit log. Runtime/disposable state — not a
// portable workspace file; resets on DB rebuild like conversations/task runs.
export const api_token_activity = sqliteTable(
  "api_token_activity",
  {
    id: text("id").primaryKey(),
    token_id: text("token_id").notNull(),
    // Snapshot at request time so revoked/renamed tokens still read correctly.
    token_name: text("token_name").notNull(),
    surface: text("surface").notNull(),
    action: text("action").notNull(),
    capability_id: text("capability_id"),
    target_kind: text("target_kind"),
    target_id: text("target_id"),
    input_summary_json: text("input_summary_json"),
    outcome: text("outcome").notNull(),
    status_code: integer("status_code"),
    error_message: text("error_message"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("api_token_activity_token_created_idx").on(table.token_id, table.created_at),
    index("api_token_activity_created_idx").on(table.created_at),
  ],
);
