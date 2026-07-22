import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const oauth_records = sqliteTable(
  "oauth_records",
  {
    model: text("model").notNull(),
    id: text("id").notNull(),
    payload_json: text("payload_json").notNull(),
    grant_id: text("grant_id"),
    user_code: text("user_code"),
    uid: text("uid"),
    consumed_at: integer("consumed_at", { mode: "timestamp_ms" }),
    expires_at: integer("expires_at", { mode: "timestamp_ms" }),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.model, table.id] }),
    index("oauth_records_model_grant_id_idx").on(table.model, table.grant_id),
    index("oauth_records_model_user_code_idx").on(table.model, table.user_code),
    index("oauth_records_model_uid_idx").on(table.model, table.uid),
    index("oauth_records_model_expires_at_idx").on(table.model, table.expires_at),
  ],
);
