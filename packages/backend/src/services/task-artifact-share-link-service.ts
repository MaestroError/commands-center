import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import {
  createTaskArtifactShareLinkInputSchema,
  taskArtifactShareLinkSchema,
  taskArtifactSharingPreferencesSchema,
  type CreateTaskArtifactShareLinkInput,
  type CreateTaskArtifactShareLinkResponse,
  type TaskArtifactShareLink,
  type TaskArtifactSharingPreferences,
  type TaskRegisteredArtifact,
  type UpdateTaskArtifactSharingPreferencesInput,
} from "@cc/shared/schemas";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { AppDb } from "../db/client.js";
import { getSetting, upsertSettingFilefirst } from "../db/helpers.js";
import { createId, now } from "../db/ids.js";
import { task_artifact_share_links } from "../db/schema/index.js";
import { NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { TaskArtifactService } from "./task-artifact-service.js";

const ARTIFACT_EXPIRY_SETTING_KEY = "taskArtifactSignedUrlExpiresInMinutes";
const DEFAULT_ARTIFACT_EXPIRY_MINUTES = 1440;

export type TaskArtifactShareLinkService = ReturnType<typeof createTaskArtifactShareLinkService>;

export function createTaskArtifactShareLinkService(options: {
  db: AppDb;
  config: RuntimeConfig;
  artifactService: TaskArtifactService;
}) {
  async function getPreferences(): Promise<TaskArtifactSharingPreferences> {
    const setting = await getSetting<number>(options.db, ARTIFACT_EXPIRY_SETTING_KEY);
    return taskArtifactSharingPreferencesSchema.parse({
      taskArtifactSignedUrlExpiresInMinutes: setting ?? DEFAULT_ARTIFACT_EXPIRY_MINUTES,
    });
  }

  return {
    getPreferences,

    async setPreferences(
      input: UpdateTaskArtifactSharingPreferencesInput,
    ): Promise<TaskArtifactSharingPreferences> {
      const parsed = taskArtifactSharingPreferencesSchema.parse(input);
      await upsertSettingFilefirst(
        options.db,
        options.config,
        ARTIFACT_EXPIRY_SETTING_KEY,
        parsed.taskArtifactSignedUrlExpiresInMinutes,
      );
      return parsed;
    },

    async listForRun(taskId: string, runId: string): Promise<TaskArtifactShareLink[]> {
      const rows = await options.db.query.task_artifact_share_links.findMany({
        where: (table, operators) =>
          operators.and(operators.eq(table.task_id, taskId), operators.eq(table.run_id, runId)),
        orderBy: (table, operators) => [operators.desc(table.created_at)],
      });

      return rows.map(mapShareLink);
    },

    async createLink(input: {
      artifact: TaskRegisteredArtifact;
      body: CreateTaskArtifactShareLinkInput;
      baseUrl: string;
    }): Promise<CreateTaskArtifactShareLinkResponse> {
      const parsed = createTaskArtifactShareLinkInputSchema.parse(input.body);
      const preferences = await getPreferences();
      const expiresInMinutes =
        parsed.expiresInMinutes ?? preferences.taskArtifactSignedUrlExpiresInMinutes;

      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashToken(token);
      const timestamp = now();
      const expiresAt =
        expiresInMinutes === 0 ? null : new Date(timestamp.getTime() + expiresInMinutes * 60_000);
      const shareId = createId();

      await options.db.insert(task_artifact_share_links).values({
        id: shareId,
        artifact_id: input.artifact.id,
        task_id: input.artifact.taskId,
        run_id: input.artifact.runId,
        token_hash: tokenHash,
        token_prefix: token.slice(0, 8),
        created_at: timestamp,
        expires_at: expiresAt,
        revoked_at: null,
        last_used_at: null,
        download_count: 0,
      });

      const url = new URL(
        `/api/public/v1/task-artifacts/download/${encodeURIComponent(shareId)}`,
        input.baseUrl,
      );
      url.searchParams.set("token", token);

      return {
        shareId,
        url: url.toString(),
        expiresAt: expiresAt?.toISOString() ?? null,
      };
    },

    async revokeLink(input: {
      taskId: string;
      runId: string;
      artifactId: string;
      shareId: string;
    }): Promise<void> {
      const timestamp = now();
      const [updated] = await options.db
        .update(task_artifact_share_links)
        .set({ revoked_at: timestamp })
        .where(
          and(
            eq(task_artifact_share_links.id, input.shareId),
            eq(task_artifact_share_links.task_id, input.taskId),
            eq(task_artifact_share_links.run_id, input.runId),
            eq(task_artifact_share_links.artifact_id, input.artifactId),
            isNull(task_artifact_share_links.revoked_at),
          ),
        )
        .returning();

      if (!updated) {
        throw new NotFoundError("Task artifact share link not found.");
      }
    },

    async validateDownload(input: {
      shareId: string;
      token: string;
    }): Promise<TaskRegisteredArtifact> {
      const row = await options.db.query.task_artifact_share_links.findFirst({
        where: (table, operators) => operators.eq(table.id, input.shareId),
      });

      if (!row || row.revoked_at || (row.expires_at && row.expires_at.getTime() <= Date.now())) {
        throw new NotFoundError("Task artifact share link not found.");
      }

      if (!isTokenMatch(input.token, row.token_hash)) {
        throw new NotFoundError("Task artifact share link not found.");
      }

      const artifact = await options.artifactService.getRegisteredArtifact(row.artifact_id);

      if (!artifact || artifact.taskId !== row.task_id || artifact.runId !== row.run_id) {
        throw new NotFoundError("Task artifact share link not found.");
      }

      await options.db
        .update(task_artifact_share_links)
        .set({
          last_used_at: now(),
          download_count: sql`${task_artifact_share_links.download_count} + 1`,
        })
        .where(eq(task_artifact_share_links.id, row.id));

      return artifact;
    },
  };
}

function mapShareLink(row: typeof task_artifact_share_links.$inferSelect): TaskArtifactShareLink {
  return taskArtifactShareLinkSchema.parse({
    id: row.id,
    artifactId: row.artifact_id,
    expiresAt: row.expires_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    downloadCount: row.download_count,
    createdAt: row.created_at.toISOString(),
  });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isTokenMatch(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}
