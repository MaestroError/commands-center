import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { agents } from "./agents.js";

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    agent_id: text("agent_id")
      .notNull()
      .references(() => agents.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    context: text("context").notNull(),
    todos_json: text("todos_json").notNull(),
    status: text("status").notNull(),
    trigger_mode: text("trigger_mode").notNull(),
    schedule_json: text("schedule_json").notNull(),
    permission_profile_json: text("permission_profile_json"),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull(),
    latest_result_summary: text("latest_result_summary"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    archived_at: integer("archived_at", { mode: "timestamp_ms" }),
    deleted_at: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("tasks_agent_id_idx").on(table.agent_id),
    index("tasks_status_idx").on(table.status),
    index("tasks_trigger_mode_idx").on(table.trigger_mode),
    index("tasks_archived_idx").on(table.archived),
    index("tasks_deleted_at_idx").on(table.deleted_at),
  ],
);

export const task_runs = sqliteTable(
  "task_runs",
  {
    id: text("id").primaryKey(),
    task_id: text("task_id")
      .notNull()
      .references(() => tasks.id),
    agent_id: text("agent_id")
      .notNull()
      .references(() => agents.id),
    opencode_session_id: text("opencode_session_id"),
    status: text("status").notNull(),
    trigger_source: text("trigger_source").notNull(),
    rendered_prompt: text("rendered_prompt").notNull(),
    rendered_context_json: text("rendered_context_json"),
    effective_permissions_json: text("effective_permissions_json"),
    result_summary: text("result_summary"),
    result_json: text("result_json"),
    error_message: text("error_message"),
    error_details_json: text("error_details_json"),
    started_at: integer("started_at", { mode: "timestamp_ms" }),
    completed_at: integer("completed_at", { mode: "timestamp_ms" }),
    cancelled_at: integer("cancelled_at", { mode: "timestamp_ms" }),
    cancellation_reason: text("cancellation_reason"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("task_runs_task_id_idx").on(table.task_id),
    index("task_runs_agent_id_idx").on(table.agent_id),
    index("task_runs_status_idx").on(table.status),
    index("task_runs_created_at_idx").on(table.created_at),
  ],
);
