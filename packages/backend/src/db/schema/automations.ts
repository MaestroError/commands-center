import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { agents } from "./agents.js";

export const automations = sqliteTable("automations", {
  id: text("id").primaryKey(),
  agent_id: text("agent_id")
    .notNull()
    .references(() => agents.id),
  title: text("title").notNull(),
  description: text("description"),
  prompt: text("prompt").notNull(),
  schedule: text("schedule").notNull(),
  timezone: text("timezone"),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const automation_runs = sqliteTable("automation_runs", {
  id: text("id").primaryKey(),
  automation_id: text("automation_id")
    .notNull()
    .references(() => automations.id),
  status: text("status").notNull(),
  prompt: text("prompt").notNull(),
  error_message: text("error_message"),
  started_at: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finished_at: integer("finished_at", { mode: "timestamp_ms" }),
  created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
