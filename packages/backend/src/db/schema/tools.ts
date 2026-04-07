import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const custom_tools = sqliteTable("custom_tools", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  instructions: text("instructions"),
  method: text("method").notNull(),
  url: text("url").notNull(),
  headers_json: text("headers_json"),
  body_json: text("body_json"),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
