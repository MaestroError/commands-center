import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import {
  createArtifactShareLinkInputSchema,
  artifactSharingPreferencesSchema,
  type CreateArtifactShareLinkInput,
  type CreateArtifactShareLinkResponse,
  type ArtifactSharingPreferences,
  type RegisteredArtifact,
  type UpdateArtifactSharingPreferencesInput,
} from "@cc/shared/schemas";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { AppDb } from "../db/client.js";
import { getSetting, upsertSettingFilefirst } from "../db/helpers.js";
import { createId, now } from "../db/ids.js";
import { artifact_share_links } from "../db/schema/index.js";
import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import { buildArtifactSignedUrl } from "../lib/artifact-signed-url.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { ArtifactService } from "./artifact-service.js";

const ARTIFACT_EXPIRY_SETTING_KEY = "taskArtifactSignedUrlExpiresInMinutes";
const DEFAULT_ARTIFACT_EXPIRY_MINUTES = 1440;

export type ArtifactShareLinkService = ReturnType<typeof createArtifactShareLinkService>;

export function createArtifactShareLinkService(options: {
  db: AppDb;
  config: RuntimeConfig;
  artifactService: ArtifactService;
}) {
  async function getPreferences(): Promise<ArtifactSharingPreferences> {
    const setting = await getSetting<number>(options.db, ARTIFACT_EXPIRY_SETTING_KEY);
    return artifactSharingPreferencesSchema.parse({
      taskArtifactSignedUrlExpiresInMinutes: setting ?? DEFAULT_ARTIFACT_EXPIRY_MINUTES,
    });
  }

  return {
    getPreferences,

    async setPreferences(
      input: UpdateArtifactSharingPreferencesInput,
    ): Promise<ArtifactSharingPreferences> {
      const parsed = artifactSharingPreferencesSchema.parse(input);
      await upsertSettingFilefirst(
        options.db,
        options.config,
        ARTIFACT_EXPIRY_SETTING_KEY,
        parsed.taskArtifactSignedUrlExpiresInMinutes,
      );
      return parsed;
    },

    // Publish the artifact's file (idempotent), then mint a signed link for it.
    async createLink(input: {
      artifactId: string;
      body: CreateArtifactShareLinkInput;
      baseUrl: string;
    }): Promise<CreateArtifactShareLinkResponse> {
      const parsed = createArtifactShareLinkInputSchema.parse(input.body);
      const artifact: RegisteredArtifact = await options.artifactService.publishArtifact(
        input.artifactId,
      );

      const preferences = await getPreferences();
      const expiresInMinutes =
        parsed.expiresInMinutes ?? preferences.taskArtifactSignedUrlExpiresInMinutes;

      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashToken(token);
      const timestamp = now();
      const expiresAt =
        expiresInMinutes === 0 ? null : new Date(timestamp.getTime() + expiresInMinutes * 60_000);
      const shareId = createId();

      await options.db.insert(artifact_share_links).values({
        id: shareId,
        artifact_id: artifact.id,
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
      const expiresAtMs = expiresAt?.getTime() ?? 0;

      return {
        shareId,
        url: url.toString(),
        displayUrl: buildArtifactSignedUrl({
          artifactId: artifact.id,
          disposition: "display",
          expMs: expiresAtMs,
          secretKey: options.config.secretKey,
          baseUrl: input.baseUrl,
        }),
        downloadUrl: buildArtifactSignedUrl({
          artifactId: artifact.id,
          disposition: "download",
          expMs: expiresAtMs,
          secretKey: options.config.secretKey,
          baseUrl: input.baseUrl,
        }),
        expiresAt: expiresAt?.toISOString() ?? null,
      };
    },

    async revokeLink(input: { artifactId: string; shareId: string }): Promise<void> {
      const timestamp = now();
      const [updated] = await options.db
        .update(artifact_share_links)
        .set({ revoked_at: timestamp })
        .where(
          and(
            eq(artifact_share_links.id, input.shareId),
            eq(artifact_share_links.artifact_id, input.artifactId),
            isNull(artifact_share_links.revoked_at),
          ),
        )
        .returning();

      if (!updated) {
        throw new NotFoundError("Artifact share link not found.");
      }
    },

    async validateDownload(input: { shareId: string; token: string }): Promise<RegisteredArtifact> {
      const row = await options.db.query.artifact_share_links.findFirst({
        where: (table, operators) => operators.eq(table.id, input.shareId),
      });

      if (!row || row.revoked_at || (row.expires_at && row.expires_at.getTime() <= Date.now())) {
        throw new NotFoundError("Artifact share link not found.");
      }

      if (!isTokenMatch(input.token, row.token_hash)) {
        throw new NotFoundError("Artifact share link not found.");
      }

      const artifact = await options.artifactService.getRegisteredArtifact(row.artifact_id);

      if (!artifact) {
        throw new NotFoundError("Artifact share link not found.");
      }

      if (!artifact.storageKey) {
        throw new BadRequestError("Artifact has not been published.");
      }

      await options.db
        .update(artifact_share_links)
        .set({
          last_used_at: now(),
          download_count: sql`${artifact_share_links.download_count} + 1`,
        })
        .where(eq(artifact_share_links.id, row.id));

      return artifact;
    },
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isTokenMatch(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}
