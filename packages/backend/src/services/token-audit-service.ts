import { lt } from "drizzle-orm";
import type { Logger } from "pino";

import {
  apiTokenAuditSettingsSchema,
  type ApiTokenActivityEntry,
  type ApiTokenActivityListResponse,
  type ApiTokenActivityOutcome,
  type ApiTokenActivitySurface,
  type ApiTokenAuditSettings,
} from "@cc/shared/schemas";

import type { AppDb } from "../db/client.js";
import { getSetting, upsertSettingFilefirst } from "../db/helpers.js";
import { createId, now } from "../db/ids.js";
import { api_token_activity } from "../db/schema/index.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { summarizeAuditInput } from "./token-audit-input.js";

const RETENTION_SETTING_KEY = "apiTokenActivityRetentionWeeks";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type AuditRow = typeof api_token_activity.$inferSelect;

export type RecordAuditInput = {
  tokenId: string;
  tokenName: string;
  surface: ApiTokenActivitySurface;
  action: string;
  capabilityId?: string | null;
  targetKind?: string | null;
  targetId?: string | null;
  /** Raw request input; summarized + redacted before storage. */
  input?: unknown;
  outcome: ApiTokenActivityOutcome;
  statusCode?: number | null;
  errorMessage?: string | null;
};

export type TokenAuditService = ReturnType<typeof createTokenAuditService>;

export function createTokenAuditService(options: {
  db: AppDb;
  config: RuntimeConfig;
  logger?: Logger;
}) {
  const { db } = options;

  return {
    // Best-effort: an audit failure must never break the request path.
    async record(input: RecordAuditInput): Promise<void> {
      try {
        await db.insert(api_token_activity).values({
          id: createId(),
          token_id: input.tokenId,
          token_name: input.tokenName,
          surface: input.surface,
          action: input.action,
          capability_id: input.capabilityId ?? null,
          target_kind: input.targetKind ?? null,
          target_id: input.targetId ?? null,
          input_summary_json:
            input.input === undefined ? null : JSON.stringify(summarizeAuditInput(input.input)),
          outcome: input.outcome,
          status_code: input.statusCode ?? null,
          error_message: input.errorMessage ? input.errorMessage.slice(0, 500) : null,
          created_at: now(),
        });
      } catch (error) {
        options.logger?.warn({ err: error, tokenId: input.tokenId }, "token audit record failed");
      }
    },

    async listForToken(query: {
      tokenId: string;
      limit?: number;
      cursor?: string | null;
    }): Promise<ApiTokenActivityListResponse> {
      const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
      const cursor = parseCursor(query.cursor);

      const rows = await db.query.api_token_activity.findMany({
        where: (table, ops) => {
          const base = ops.eq(table.token_id, query.tokenId);
          if (!cursor) {
            return base;
          }
          const cursorDate = new Date(cursor.ms);
          return ops.and(
            base,
            ops.or(
              ops.lt(table.created_at, cursorDate),
              ops.and(ops.eq(table.created_at, cursorDate), ops.lt(table.id, cursor.id)),
            ),
          );
        },
        orderBy: (table, ops) => [ops.desc(table.created_at), ops.desc(table.id)],
        limit: limit + 1,
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page[page.length - 1];

      return {
        entries: page.map(mapEntry),
        nextCursor: hasMore && last ? encodeCursor(last.created_at.getTime(), last.id) : null,
      };
    },

    async prune(olderThanMs: number): Promise<number> {
      const result = await db
        .delete(api_token_activity)
        .where(lt(api_token_activity.created_at, new Date(olderThanMs)));
      return (result as { changes?: number }).changes ?? 0;
    },

    async getSettings(): Promise<ApiTokenAuditSettings> {
      const stored = await getSetting<number>(db, RETENTION_SETTING_KEY);
      return apiTokenAuditSettingsSchema.parse(
        stored === undefined ? {} : { retentionWeeks: stored },
      );
    },

    async setSettings(input: ApiTokenAuditSettings): Promise<ApiTokenAuditSettings> {
      const parsed = apiTokenAuditSettingsSchema.parse(input);
      await upsertSettingFilefirst(
        db,
        options.config,
        RETENTION_SETTING_KEY,
        parsed.retentionWeeks,
      );
      return parsed;
    },

    // Delete entries older than the configured retention window.
    async pruneExpired(): Promise<number> {
      const { retentionWeeks } = await this.getSettings();
      return this.prune(Date.now() - retentionWeeks * WEEK_MS);
    },
  };
}

function mapEntry(row: AuditRow): ApiTokenActivityEntry {
  return {
    id: row.id,
    tokenId: row.token_id,
    tokenName: row.token_name,
    surface: row.surface as ApiTokenActivitySurface,
    action: row.action,
    capabilityId: row.capability_id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    inputSummary: row.input_summary_json
      ? (JSON.parse(row.input_summary_json) as unknown)
      : undefined,
    outcome: row.outcome as ApiTokenActivityOutcome,
    statusCode: row.status_code,
    errorMessage: row.error_message,
    createdAt: row.created_at.getTime(),
  };
}

function encodeCursor(ms: number, id: string): string {
  return Buffer.from(`${String(ms)}:${id}`).toString("base64url");
}

function parseCursor(cursor: string | null | undefined): { ms: number; id: string } | undefined {
  if (!cursor) {
    return undefined;
  }
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator === -1) {
      return undefined;
    }
    const ms = Number(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (!Number.isFinite(ms) || id.length === 0) {
      return undefined;
    }
    return { ms, id };
  } catch {
    return undefined;
  }
}
