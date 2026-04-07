import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const mcp_servers = sqliteTable("mcp_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  transport: text("transport").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  config_json: text("config_json").notNull(),
  created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
