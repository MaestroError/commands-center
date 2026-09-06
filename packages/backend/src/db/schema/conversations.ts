import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    // Provider-reported usage for assistant messages, captured from OpenCode's
    // `info` on each sync. Null on user messages and on messages synced before
    // CC persisted these, which fall back to their `step-finish` parts.
    // Typed columns rather than a blob so usage can be aggregated in SQL.
    tokens_input: integer("tokens_input"),
    tokens_output: integer("tokens_output"),
    tokens_reasoning: integer("tokens_reasoning"),
    tokens_cache_read: integer("tokens_cache_read"),
    tokens_cache_write: integer("tokens_cache_write"),
    // OpenCode's own total when reported. Never displayed — providers disagree
    // on what it covers; totals shown are summed from the components.
    tokens_reported_total: integer("tokens_reported_total"),
    cost: real("cost"),
    model_id: text("model_id"),
    provider_id: text("provider_id"),
    agent: text("agent"),
    variant: text("variant"),
    finish: text("finish"),
    summary: integer("summary", { mode: "boolean" }),
    // Explicitly null when OpenCode never reported completion. `updated_at`
    // cannot express that: it falls back to created_at, so an unfinished turn
    // is indistinguishable from an instant one.
    completed_at: integer("completed_at", { mode: "timestamp_ms" }),
    // Snapshot of the system prompts sent with this (user) message. Preserved
    // across the delete+reinsert resync by keying on the stable OpenCode id.
    system_prompt_snapshot_json: text("system_prompt_snapshot_json"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("messages_conversation_id_idx").on(table.conversation_id)],
);
