import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { agents } from "./agents.js";

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    agent_id: text("agent_id")
      .notNull()
      .references(() => agents.id),
    opencode_session_id: text("opencode_session_id").notNull(),
    title: text("title"),
    status: text("status").notNull(),
    is_current: integer("is_current", { mode: "boolean" }).notNull().default(false),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("conversations_opencode_session_id_unique").on(table.opencode_session_id),
    index("conversations_agent_id_idx").on(table.agent_id),
    index("conversations_agent_current_idx").on(table.agent_id, table.is_current),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversation_id: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    role: text("role").notNull(),
    content: text("content").notNull(),
    parts_json: text("parts_json"),
    attachments_json: text("attachments_json"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("messages_conversation_id_idx").on(table.conversation_id)],
);
