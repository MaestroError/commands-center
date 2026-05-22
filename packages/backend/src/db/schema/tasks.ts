import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { agents } from "./agents.js";

export const task_templates = sqliteTable(
  "task_templates",
  {
    id: text("id").primaryKey(),
    agent_id: text("agent_id")
      .notNull()
      .references(() => agents.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    todos_json: text("todos_json").notNull(),
    status: text("status").notNull(),
    trigger_mode: text("trigger_mode").notNull(),
    schedule_json: text("schedule_json").notNull(),
    permission_profile_json: text("permission_profile_json"),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull(),
    latest_final_message: text("latest_final_message"),
    latest_task_id: text("latest_task_id"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    archived_at: integer("archived_at", { mode: "timestamp_ms" }),
    deleted_at: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("task_templates_agent_id_idx").on(table.agent_id),
    index("task_templates_status_idx").on(table.status),
    index("task_templates_trigger_mode_idx").on(table.trigger_mode),
    index("task_templates_archived_idx").on(table.archived),
    index("task_templates_deleted_at_idx").on(table.deleted_at),
  ],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    template_id: text("template_id").references(() => task_templates.id),
    agent_id: text("agent_id")
      .notNull()
      .references(() => agents.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    context: text("context").notNull(),
    todos_json: text("todos_json").notNull(),
    status: text("status").notNull(),
    trigger_mode: text("trigger_mode").notNull(),
    trigger_source: text("trigger_source"),
    schedule_json: text("schedule_json").notNull(),
    permission_profile_json: text("permission_profile_json"),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull(),
    latest_final_message: text("latest_final_message"),
    scheduled_for: integer("scheduled_for", { mode: "timestamp_ms" }),
    due_at: integer("due_at", { mode: "timestamp_ms" }),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    archived_at: integer("archived_at", { mode: "timestamp_ms" }),
    deleted_at: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("tasks_template_id_idx").on(table.template_id),
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
    context_json: text("context_json"),
    rendered_prompt: text("rendered_prompt").notNull(),
    rendered_context_json: text("rendered_context_json"),
    effective_permissions_json: text("effective_permissions_json"),
    final_message: text("final_message"),
    result_text: text("result_text"),
    artifacts_json: text("artifacts_json").default("[]"),
    needs_human_review: integer("needs_human_review", { mode: "boolean" }).default(false),
    human_review_reason: text("human_review_reason"),
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

export const task_scheduler_state = sqliteTable(
  "task_scheduler_state",
  {
    task_id: text("task_id")
      .primaryKey()
      .references(() => tasks.id),
    next_run_at: integer("next_run_at", { mode: "timestamp_ms" }),
    last_scheduled_at: integer("last_scheduled_at", { mode: "timestamp_ms" }),
    last_error: text("last_error"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("task_scheduler_state_next_run_at_idx").on(table.next_run_at)],
);
