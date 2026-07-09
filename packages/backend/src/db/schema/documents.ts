import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    scope: text("scope", { enum: ["global", "private"] })
      .notNull()
      .default("global"),
    owner_slug: text("owner_slug"),
    owner_specialist_id: text("owner_specialist_id"),
    relative_path: text("relative_path").notNull(),
    author: text("author"),
    title: text("title"),
    description: text("description"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    last_seen_at: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("documents_global_relative_path_unique")
      .on(table.relative_path)
      .where(
        sql`${table.scope} = 'global' and ${table.owner_slug} is null and ${table.owner_specialist_id} is null`,
      ),
    uniqueIndex("documents_private_owner_path_unique")
      .on(table.owner_specialist_id, table.relative_path)
      .where(sql`${table.scope} = 'private'`),
  ],
);
