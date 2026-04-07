import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { agents } from "./agents.js";

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  agent_id: text("agent_id")
    .notNull()
    .references(() => agents.id),
  title: text("title"),
  status: text("status").notNull(),
  created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversation_id: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  parts_json: text("parts_json"),
  created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
