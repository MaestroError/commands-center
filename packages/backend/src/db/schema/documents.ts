import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  relative_path: text("relative_path").notNull().unique(),
  author: text("author"),
  title: text("title"),
  description: text("description"),
  created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  last_seen_at: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
});
