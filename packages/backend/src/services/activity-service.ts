import { and, eq, inArray, sql } from "drizzle-orm";
import type { Logger } from "pino";

import {
  activitySchema,
  type Activity,
  type ActivityKind,
  type ActivityLevel,
  type UnarchiveActivityResponse,
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

  return {
    /** Create a pending activity, or update the existing non-archived one with the same dedupeKey. */
    async emit(input: EmitActivityInput): Promise<Activity> {
      const now = new Date();
      const payloadJson = input.payload ? JSON.stringify(input.payload) : null;

      if (input.dedupeKey) {
        const [row] = await db
          .insert(activities)
          .values({
            id: createId(),
            kind: input.kind,
            level: input.level,
            status: "pending",
            title: input.title,
            body: input.body ?? null,
            payload_json: payloadJson,
            dedupe_key: input.dedupeKey,
            created_at: now,
            updated_at: now,
            archived_at: null,
          })
          .onConflictDoUpdate({
            target: activities.dedupe_key,
            targetWhere: sql`${activities.status} = 'pending'`,
            set: {
              kind: input.kind,
              level: input.level,
              title: input.title,
              body: input.body ?? null,
              payload_json: payloadJson,
              updated_at: now,
            },
          })
          .returning();
        if (!row) {
          throw new Error("Failed to emit activity.");
        }
        return mapActivity(row);
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

    async unarchive(id: string): Promise<UnarchiveActivityResponse> {
      const existing = await db.query.activities.findFirst({
        where: (table, operators) => operators.eq(table.id, id),
      });
      if (!existing) {
        throw new NotFoundError("Activity not found.");
      }
      if (existing.status === "pending") {
        return { activity: mapActivity(existing), archivedActivityIds: [] };
      }
      const now = new Date();
      const archivedActivityIds = db.transaction((tx) => {
        let archivedIds: string[] = [];
        if (existing.dedupe_key) {
          archivedIds = tx
            .update(activities)
            .set({ status: "archived", archived_at: now, updated_at: now })
            .where(
              and(eq(activities.dedupe_key, existing.dedupe_key), eq(activities.status, "pending")),
            )
            .returning({ id: activities.id })
            .all()
            .map(({ id: archivedId }) => archivedId);
        }
        tx.update(activities)
          .set({ status: "pending", archived_at: null, updated_at: now })
          .where(eq(activities.id, id))
          .run();
        return archivedIds;
      });
      return {
        activity: mapActivity({
          ...existing,
          status: "pending",
          archived_at: null,
          updated_at: now,
        }),
        archivedActivityIds,
      };
    },

    async archiveAllPending(): Promise<number> {
      const now = new Date();
      const archived = await db
        .update(activities)
        .set({ status: "archived", archived_at: now, updated_at: now })
        .where(eq(activities.status, "pending"))
        .returning({ id: activities.id });
      return archived.length;
    },

    async archiveCompletedTaskActivities(taskId: string): Promise<number> {
      const pendingCompletedActivities = await db.query.activities.findMany({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.status, "pending"),
            operators.eq(table.kind, "task_completed"),
          ),
        columns: { id: true, payload_json: true },
      });
      const matchingIds = pendingCompletedActivities
        .filter((activity) => readTaskId(activity.payload_json) === taskId)
        .map((activity) => activity.id);

      if (matchingIds.length === 0) {
        return 0;
      }

      const now = new Date();
      const archived = await db
        .update(activities)
        .set({ status: "archived", archived_at: now, updated_at: now })
        .where(inArray(activities.id, matchingIds))
        .returning({ id: activities.id });
      return archived.length;
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

function readTaskId(payloadJson: string | null): string | undefined {
  if (!payloadJson) {
    return undefined;
  }
  try {
    const payload: unknown = JSON.parse(payloadJson);
    if (typeof payload === "object" && payload !== null && "taskId" in payload) {
      const taskId = payload.taskId;
      return typeof taskId === "string" ? taskId : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
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
