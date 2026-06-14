import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// CC product code calls this concept "specialists". The SQLite cache keeps the
// original `agents` table name because it is internal runtime storage, not the
// portable workspace contract.
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  instructions: text("instructions").notNull(),
  default_model: text("default_model").notNull(),
  icon_path: text("icon_path"),
  status: text("status").notNull(),
  capabilities_json: text("capabilities_json").notNull(),
  created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  archived_at: integer("archived_at", { mode: "timestamp_ms" }),
});
