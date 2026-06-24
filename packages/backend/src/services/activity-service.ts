import { and, eq } from "drizzle-orm";
import type { Logger } from "pino";

import {
  activitySchema,
  type Activity,
  type ActivityKind,
  type ActivityLevel,
} from "@cc/shared/schemas";

import type { AppDb } from "../db/client.js";
import { createId } from "../db/ids.js";
import { activities } from "../db/schema/index.js";
import { NotFoundError } from "../lib/api-error.js";

type ActivityRow = typeof activities.$inferSelect;

export type EmitActivityInput = {
  kind: ActivityKind;
  level: ActivityLevel;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown>;
  /** When set, re-emits collapse onto the existing non-archived card. */
  dedupeKey?: string | null;
};

export type ActivityService = ReturnType<typeof createActivityService>;

export function createActivityService(options: { db: AppDb; logger?: Logger }) {
  const { db } = options;

  async function findPendingByDedupeKey(dedupeKey: string): Promise<ActivityRow | undefined> {
    return db.query.activities.findFirst({
      where: (table, operators) =>
        operators.and(
          operators.eq(table.dedupe_key, dedupeKey),
          operators.eq(table.status, "pending"),
        ),
    });
  }

  return {
    /** Create a pending activity, or update the existing non-archived one with the same dedupeKey. */
    async emit(input: EmitActivityInput): Promise<Activity> {
      const now = new Date();
      const payloadJson = input.payload ? JSON.stringify(input.payload) : null;

      if (input.dedupeKey) {
        const existing = await findPendingByDedupeKey(input.dedupeKey);
        if (existing) {
          await db
            .update(activities)
            .set({
              kind: input.kind,
              level: input.level,
              title: input.title,
              body: input.body ?? null,
              payload_json: payloadJson,
              updated_at: now,
            })
            .where(eq(activities.id, existing.id));
          return mapActivity({
            ...existing,
            kind: input.kind,
            level: input.level,
            title: input.title,
            body: input.body ?? null,
            payload_json: payloadJson,
            updated_at: now,
          });
        }
      }

      const row: ActivityRow = {
        id: createId(),
        kind: input.kind,
        level: input.level,
        status: "pending",
        title: input.title,
        body: input.body ?? null,
        payload_json: payloadJson,
        dedupe_key: input.dedupeKey ?? null,
        created_at: now,
        updated_at: now,
        archived_at: null,
      };
      await db.insert(activities).values(row);
      return mapActivity(row);
    },

    /** Thread order is newest-last (ascending). `status` defaults to pending. */
    async list(query: { status?: "pending" | "archived" | "all" } = {}): Promise<Activity[]> {
      const status = query.status ?? "pending";
      const rows = await db.query.activities.findMany({
        where:
          status === "all" ? undefined : (table, operators) => operators.eq(table.status, status),
        orderBy: (table, operators) => [operators.asc(table.created_at), operators.asc(table.id)],
      });
      return rows.map(mapActivity);
    },

    async actionRequiredCount(): Promise<number> {
      const rows = await db.query.activities.findMany({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.status, "pending"),
            operators.eq(table.level, "action_required"),
          ),
        columns: { id: true },
      });
      return rows.length;
    },

    async get(id: string): Promise<Activity | undefined> {
      const row = await db.query.activities.findFirst({
        where: (table, operators) => operators.eq(table.id, id),
      });
      return row ? mapActivity(row) : undefined;
    },

    /** Mark an activity archived (idempotent). Throws NotFoundError for unknown ids. */
    async archive(id: string): Promise<Activity> {
      const existing = await db.query.activities.findFirst({
        where: (table, operators) => operators.eq(table.id, id),
      });
      if (!existing) {
        throw new NotFoundError("Activity not found.");
      }
      if (existing.status === "archived") {
        return mapActivity(existing);
      }
      const now = new Date();
      await db
        .update(activities)
        .set({ status: "archived", archived_at: now, updated_at: now })
        .where(eq(activities.id, id));
      return mapActivity({ ...existing, status: "archived", archived_at: now, updated_at: now });
    },

    /** Archive all pending activities sharing a dedupeKey (for producers superseding a card). */
    async archiveByDedupeKey(dedupeKey: string): Promise<void> {
      const now = new Date();
      await db
        .update(activities)
        .set({ status: "archived", archived_at: now, updated_at: now })
        .where(and(eq(activities.dedupe_key, dedupeKey), eq(activities.status, "pending")));
    },
  };
}

function mapActivity(row: ActivityRow): Activity {
  return activitySchema.parse({
    id: row.id,
    kind: row.kind,
    level: row.level,
    status: row.status,
    title: row.title,
    body: row.body,
    payload: row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
  });
}
