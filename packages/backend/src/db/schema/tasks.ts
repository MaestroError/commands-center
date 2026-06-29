import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { agents } from "./agents.js";

export const task_templates = sqliteTable(
  "task_templates",
  {
    id: text("id").primaryKey(),
    agent_id: text("agent_id")
      .notNull()
      .references(() => agents.id),
    default_agent_id: text("default_agent_id").references(() => agents.id),
    model: text("model"),
    fallback_models: text("fallback_models").notNull().default("[]"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    todos_json: text("todos_json").notNull(),
    status: text("status").notNull(),
    recurrence_json: text("recurrence_json"),
    permission_profile_json: text("permission_profile_json"),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull(),
    latest_final_message: text("latest_final_message"),
    latest_task_id: text("latest_task_id"),
    next_occurrence_at: integer("next_occurrence_at", { mode: "timestamp_ms" }),
    last_generated_occurrence_at: integer("last_generated_occurrence_at", {
      mode: "timestamp_ms",
    }),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    archived_at: integer("archived_at", { mode: "timestamp_ms" }),
    deleted_at: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("task_templates_agent_id_idx").on(table.agent_id),
    index("task_templates_default_agent_id_idx").on(table.default_agent_id),
    index("task_templates_status_idx").on(table.status),
    index("task_templates_next_occurrence_at_idx").on(table.next_occurrence_at),
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
    default_agent_id: text("default_agent_id").references(() => agents.id),
    model: text("model"),
    fallback_models: text("fallback_models").notNull().default("[]"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    context: text("context").notNull(),
    todos_json: text("todos_json").notNull(),
    status: text("status").notNull(),
    trigger_source: text("trigger_source"),
    permission_profile_json: text("permission_profile_json"),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull(),
    latest_final_message: text("latest_final_message"),
    latest_result_text: text("latest_result_text"),
    latest_run_id: text("latest_run_id"),
    source_template_id: text("source_template_id").references(() => task_templates.id),
    generated_by_agent_id: text("generated_by_agent_id").references(() => agents.id),
    source_occurrence_at: integer("source_occurrence_at", { mode: "timestamp_ms" }),
    scheduled_at: integer("scheduled_at", { mode: "timestamp_ms" }),
    scheduled_for: integer("scheduled_for", { mode: "timestamp_ms" }),
    due_at: integer("due_at", { mode: "timestamp_ms" }),
    done_at: integer("done_at", { mode: "timestamp_ms" }),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    archived_at: integer("archived_at", { mode: "timestamp_ms" }),
    deleted_at: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("tasks_template_id_idx").on(table.template_id),
    index("tasks_agent_id_idx").on(table.agent_id),
    index("tasks_default_agent_id_idx").on(table.default_agent_id),
    index("tasks_status_idx").on(table.status),
    index("tasks_source_template_id_idx").on(table.source_template_id),
    index("tasks_generated_by_agent_id_idx").on(table.generated_by_agent_id),
    uniqueIndex("tasks_source_template_occurrence_unique_idx").on(
      table.source_template_id,
      table.source_occurrence_at,
    ),
    index("tasks_scheduled_at_idx").on(table.scheduled_at),
    index("tasks_done_at_idx").on(table.done_at),
    index("tasks_archived_idx").on(table.archived),
    index("tasks_deleted_at_idx").on(table.deleted_at),
  ],
);

export const task_feedback = sqliteTable(
  "task_feedback",
  {
    id: text("id").primaryKey(),
    task_id: text("task_id")
      .notNull()
      .references(() => tasks.id),
    body: text("body").notNull(),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deleted_at: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("task_feedback_task_id_idx").on(table.task_id),
    index("task_feedback_deleted_at_idx").on(table.deleted_at),
  ],
);

export const task_subtasks = sqliteTable(
  "task_subtasks",
  {
    id: text("id").primaryKey(),
    task_id: text("task_id")
      .notNull()
      .references(() => tasks.id),
    feedback_id: text("feedback_id").references(() => task_feedback.id),
    agent_id: text("agent_id")
      .notNull()
      .references(() => agents.id),
    description: text("description").notNull(),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deleted_at: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("task_subtasks_task_id_idx").on(table.task_id),
    index("task_subtasks_feedback_id_idx").on(table.feedback_id),
    index("task_subtasks_agent_id_idx").on(table.agent_id),
    index("task_subtasks_deleted_at_idx").on(table.deleted_at),
  ],
);

export const task_runs = sqliteTable(
  "task_runs",
  {
    id: text("id").primaryKey(),
    task_id: text("task_id")
      .notNull()
      .references(() => tasks.id),
    subtask_id: text("subtask_id").references(() => task_subtasks.id),
    agent_id: text("agent_id")
      .notNull()
      .references(() => agents.id),
    model: text("model"),
    fallback_models: text("fallback_models").notNull().default("[]"),
    retry_of_run_id: text("retry_of_run_id").references((): AnySQLiteColumn => task_runs.id),
    opencode_session_id: text("opencode_session_id"),
    status: text("status").notNull(),
    trigger_source: text("trigger_source").notNull(),
    outcome: text("outcome"),
    context_json: text("context_json"),
    trigger_metadata_json: text("trigger_metadata_json"),
    rendered_prompt: text("rendered_prompt").notNull(),
    rendered_context_json: text("rendered_context_json"),
    effective_permissions_json: text("effective_permissions_json"),
    final_message: text("final_message"),
    result_text: text("result_text"),
    artifacts_json: text("artifacts_json").default("[]"),
    needs_human_review: integer("needs_human_review", { mode: "boolean" }).default(false),
    human_review_reason: text("human_review_reason"),
    review_question_json: text("review_question_json"),
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
    index("task_runs_subtask_id_idx").on(table.subtask_id),
    index("task_runs_agent_id_idx").on(table.agent_id),
    index("task_runs_status_idx").on(table.status),
    uniqueIndex("task_runs_agent_running_unique_idx")
      .on(table.agent_id)
      .where(sql`${table.status} = 'running'`),
    index("task_runs_outcome_idx").on(table.outcome),
    index("task_runs_created_at_idx").on(table.created_at),
  ],
);

export const task_run_followups = sqliteTable(
  "task_run_followups",
  {
    id: text("id").primaryKey(),
    task_id: text("task_id")
      .notNull()
      .references(() => tasks.id),
    run_id: text("run_id")
      .notNull()
      .references(() => task_runs.id),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    body: text("body").notNull(),
    sent_at: integer("sent_at", { mode: "timestamp_ms" }),
    error_message: text("error_message"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("task_run_followups_task_id_idx").on(table.task_id),
    index("task_run_followups_run_id_idx").on(table.run_id),
    index("task_run_followups_run_status_idx").on(table.run_id, table.status),
    index("task_run_followups_created_at_idx").on(table.created_at),
  ],
);

export const task_artifact_share_links = sqliteTable(
  "task_artifact_share_links",
  {
    id: text("id").primaryKey(),
    artifact_id: text("artifact_id").notNull(),
    task_id: text("task_id")
      .notNull()
      .references(() => tasks.id),
    run_id: text("run_id")
      .notNull()
      .references(() => task_runs.id),
    token_hash: text("token_hash").notNull().unique(),
    token_prefix: text("token_prefix").notNull(),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expires_at: integer("expires_at", { mode: "timestamp_ms" }),
    revoked_at: integer("revoked_at", { mode: "timestamp_ms" }),
    last_used_at: integer("last_used_at", { mode: "timestamp_ms" }),
    download_count: integer("download_count").notNull().default(0),
  },
  (table) => [
    index("task_artifact_share_links_artifact_id_idx").on(table.artifact_id),
    index("task_artifact_share_links_task_run_idx").on(table.task_id, table.run_id),
    index("task_artifact_share_links_expires_at_idx").on(table.expires_at),
  ],
);

export const task_scheduler_state = sqliteTable(
  "task_scheduler_state",
  {
    task_id: text("task_id").primaryKey(),
    next_run_at: integer("next_run_at", { mode: "timestamp_ms" }),
    last_scheduled_at: integer("last_scheduled_at", { mode: "timestamp_ms" }),
    last_error: text("last_error"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("task_scheduler_state_next_run_at_idx").on(table.next_run_at)],
);
