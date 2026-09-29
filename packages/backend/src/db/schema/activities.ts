import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Durable owner-global activity thread (inbox). Runtime/DB state — not a portable
// workspace file; resets on DB rebuild like conversations and task runs.
export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    level: text("level").notNull(),
    status: text("status").notNull().default("pending"),
    title: text("title").notNull(),
    body: text("body"),
    payload_json: text("payload_json"),
    // Collapses re-emits of the same source event into one card.
    dedupe_key: text("dedupe_key"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    archived_at: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("activities_status_idx").on(table.status),
    uniqueIndex("activities_pending_dedupe_key_unique_idx")
      .on(table.dedupe_key)
      .where(sql`${table.status} = 'pending'`),
  ],
);
