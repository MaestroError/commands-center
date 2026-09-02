import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { agents } from "./agents.js";
import { task_runs, tasks } from "./tasks.js";

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
    source: text("source").notNull().default("chat"),
    is_current: integer("is_current", { mode: "boolean" }).notNull().default(false),
    task_id: text("task_id").references(() => tasks.id),
    task_run_id: text("task_run_id").references(() => task_runs.id),
    // Per-conversation system prompt enabled overrides (JSON Record<id, boolean>).
    // null → every prompt uses its enabledByDefault. Runtime state, not portable.
    system_prompt_overrides_json: text("system_prompt_overrides_json"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    converted_at: integer("converted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("conversations_opencode_session_id_unique").on(table.opencode_session_id),
    uniqueIndex("conversations_task_run_id_unique").on(table.task_run_id),
    index("conversations_agent_id_idx").on(table.agent_id),
    index("conversations_agent_current_idx").on(table.agent_id, table.is_current),
    index("conversations_agent_source_idx").on(table.agent_id, table.source),
    index("conversations_task_id_idx").on(table.task_id),
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
    error_json: text("error_json"),
    // Snapshot of the system prompts sent with this (user) message. Preserved
    // across the delete+reinsert resync by keying on the stable OpenCode id.
    system_prompt_snapshot_json: text("system_prompt_snapshot_json"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    completed_at: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("messages_conversation_id_idx").on(table.conversation_id)],
);
