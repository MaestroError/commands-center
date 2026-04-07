import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  provider_key: text("provider_key").notNull().unique(),
  label: text("label"),
  auth_type: text("auth_type").notNull(),
  auth_config_json: text("auth_config_json"),
  created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
