import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { conversations } from "./conversations.js";

// Artifacts are first-class, conversation-anchored records. Both chat and
// task-run sessions are conversations, so this is the single home for any
// file / link / document a specialist produces, regardless of where it was
// generated. A task run's artifacts are simply the artifacts of its
// conversation (conversations.task_run_id).
export const artifacts = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    conversation_id: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    title: text("title").notNull(),
    description: text("description"),
    // "url" | "file" | "document"
    type: text("type").notNull(),
    // For "url": an absolute URL. For "file": a workspace-relative path.
    // For "document": a path relative to the Documents/ module (relative to the
    // owner's private Documents/ when document_scope is "private").
    link: text("link").notNull(),
    // Scope of a "document" artifact: "global" (shared Documents module) or
    // "private" (a specialist's private workspace). document_owner_slug is the
    // owning specialist's slug when private. Null/"global" for other types.
    document_scope: text("document_scope", { enum: ["global", "private"] })
      .notNull()
      .default("global"),
    document_owner_slug: text("document_owner_slug"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("artifacts_conversation_id_idx").on(table.conversation_id),
    index("artifacts_conversation_created_idx").on(table.conversation_id, table.created_at),
  ],
);

// Public download links for an artifact. Keyed purely by artifact_id, so
// sharing is independent of whether the artifact came from a chat or a task
// run.
export const artifact_share_links = sqliteTable(
  "artifact_share_links",
  {
    id: text("id").primaryKey(),
    artifact_id: text("artifact_id")
      .notNull()
      .references(() => artifacts.id),
    token_hash: text("token_hash").notNull().unique(),
    token_prefix: text("token_prefix").notNull(),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expires_at: integer("expires_at", { mode: "timestamp_ms" }),
    revoked_at: integer("revoked_at", { mode: "timestamp_ms" }),
    last_used_at: integer("last_used_at", { mode: "timestamp_ms" }),
    download_count: integer("download_count").notNull().default(0),
  },
  (table) => [
    index("artifact_share_links_artifact_id_idx").on(table.artifact_id),
    index("artifact_share_links_expires_at_idx").on(table.expires_at),
  ],
);
