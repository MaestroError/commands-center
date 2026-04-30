import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const custom_tools = sqliteTable("custom_tools", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  entry_file: text("entry_file").notNull(),
  fingerprint: text("fingerprint").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
