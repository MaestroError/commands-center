import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";

import {
  artifactSchema,
  registeredArtifactSchema,
  type AddArtifactInput,
  type Artifact,
  type ArtifactShareLink,
  type RegisteredArtifact,
} from "@cc/shared/schemas";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { AppDb } from "../db/client.js";
import { artifacts, conversations as conversationsTable } from "../db/schema/index.js";
import type { artifact_share_links } from "../db/schema/index.js";
import { createId, now } from "../db/ids.js";
import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import { writeConfigFileAtomic } from "../lib/config-file.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";

const ARTIFACT_MANIFEST_FILE = "published-artifacts.json";

const ARTIFACT_MIME_TYPES = {
  ".csv": "text/csv",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webp": "image/webp",
} as const;

// Published-file metadata, keyed by the artifact's stable id. Sharing is
// artifact-centric now, so no task/run identity is involved.
const publishedArtifactSchema = z.object({
  id: z.string().min(1),
  originalFilename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  checksum: z.string().min(1),
  storageKey: z.string().min(1),
  createdAt: z.string().datetime(),
});

const artifactManifestSchema = z.object({
  version: z.literal(1),
  artifacts: z.array(publishedArtifactSchema),
});

type ArtifactRow = typeof artifacts.$inferSelect;

export type ArtifactService = ReturnType<typeof createArtifactService>;

export function createArtifactService(options: { db: AppDb; config: RuntimeConfig }) {
  async function getRow(artifactId: string): Promise<ArtifactRow | undefined> {
    return options.db.query.artifacts.findFirst({
      where: (table, operators) => operators.eq(table.id, artifactId),
    });
  }

  async function listShareLinksByArtifactIds(
    artifactIds: string[],
  ): Promise<Map<string, ArtifactShareLink[]>> {
    const grouped = new Map<string, ArtifactShareLink[]>();

    if (artifactIds.length === 0) {
      return grouped;
    }

    const rows = await options.db.query.artifact_share_links.findMany({
      where: (table, operators) =>
        operators.and(
          operators.inArray(table.artifact_id, artifactIds),
          operators.isNull(table.revoked_at),
        ),
      orderBy: (table, operators) => [operators.desc(table.created_at)],
    });

    for (const row of rows) {
      const link = mapShareLink(row);
      const existing = grouped.get(row.artifact_id);
      if (existing) {
        existing.push(link);
      } else {
        grouped.set(row.artifact_id, [link]);
      }
    }

    return grouped;
  }

  return {
    async create(input: { conversationId: string } & AddArtifactInput): Promise<Artifact> {
      const id = createId();
      const timestamp = now();

      await options.db.insert(artifacts).values({
        id,
        conversation_id: input.conversationId,
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        link: input.link,
        created_at: timestamp,
      });

      const row = await getRow(id);

      if (!row) {
        throw new Error("Failed to create artifact record.");
      }

      return mapArtifact(row, []);
    },

    async listByConversation(conversationId: string): Promise<Artifact[]> {
      const rows = await options.db.query.artifacts.findMany({
        where: (table, operators) => operators.eq(table.conversation_id, conversationId),
        orderBy: (table, operators) => [operators.desc(table.created_at)],
      });

      const shareLinks = await listShareLinksByArtifactIds(rows.map((row) => row.id));

      return rows.map((row) => mapArtifact(row, shareLinks.get(row.id) ?? []));
    },

    // Batched loader for task-run artifacts: returns each run's artifacts keyed
    // by the run id, resolved through the run's conversation.
    async listByTaskRunIds(runIds: string[]): Promise<Map<string, Artifact[]>> {
      const grouped = new Map<string, Artifact[]>();

      if (runIds.length === 0) {
        return grouped;
      }

      const rows = await options.db
        .select({
          runId: conversationsTable.task_run_id,
          artifact: artifacts,
        })
        .from(artifacts)
        .innerJoin(conversationsTable, eq(artifacts.conversation_id, conversationsTable.id))
        .where(inArray(conversationsTable.task_run_id, runIds))
        .orderBy(desc(artifacts.created_at));

      const shareLinks = await listShareLinksByArtifactIds(rows.map((row) => row.artifact.id));

      for (const { runId, artifact } of rows) {
        if (!runId) {
          continue;
        }
        const mapped = mapArtifact(artifact, shareLinks.get(artifact.id) ?? []);
        const existing = grouped.get(runId);
        if (existing) {
          existing.push(mapped);
        } else {
          grouped.set(runId, [mapped]);
        }
      }

      return grouped;
    },

    async getArtifact(artifactId: string): Promise<Artifact | undefined> {
      const row = await getRow(artifactId);
      if (!row) {
        return undefined;
      }
      const shareLinks = await listShareLinksByArtifactIds([artifactId]);
      return mapArtifact(row, shareLinks.get(artifactId) ?? []);
    },

    // Copy the artifact's workspace file into stable storage so a shared link
    // serves an immutable snapshot. Idempotent: re-publishing returns the
    // existing entry.
    async publishArtifact(artifactId: string): Promise<RegisteredArtifact> {
      const row = await getRow(artifactId);

      if (!row) {
        throw new NotFoundError("Artifact not found.");
      }

      if (row.type !== "file") {
        throw new BadRequestError("Only file artifacts can be shared.");
      }

      const manifest = await readManifest(options.config);
      const existing = manifest.artifacts.find((entry) => entry.id === artifactId);

      if (existing) {
        return toRegisteredArtifact(row, existing, []);
      }

      const filename = validateFilename(row.link);
      const mimeType = resolveMimeType(filename);
      const sourcePath = resolveWorkspaceSourcePath(options.config, row.link);
      const sourceStat = await stat(sourcePath).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new NotFoundError("Artifact source file not found.");
        }
        throw error;
      });

      if (!sourceStat.isFile()) {
        throw new BadRequestError("Artifact source must be a file.");
      }

      const content = await readFile(sourcePath);
      const checksum = createHash("sha256").update(content).digest("hex");
      const storageKey = `artifacts/${artifactId}/${filename}`;
      const destinationPath = resolveArtifactStoragePath(options.config, storageKey);

      await mkdir(dirname(destinationPath), { recursive: true });
      await copyFile(sourcePath, destinationPath);

      const stored = publishedArtifactSchema.parse({
        id: artifactId,
        originalFilename: filename,
        mimeType,
        sizeBytes: sourceStat.size,
        checksum,
        storageKey,
        createdAt: new Date().toISOString(),
      });

      await writeManifest(options.config, {
        version: 1,
        artifacts: [...manifest.artifacts, stored],
      });

      return toRegisteredArtifact(row, stored, []);
    },

    // Download-time lookup: resolves the published file metadata for a shared
    // artifact. Returns undefined if the artifact was never published.
    async getRegisteredArtifact(artifactId: string): Promise<RegisteredArtifact | undefined> {
      const row = await getRow(artifactId);

      if (!row || row.type !== "file") {
        return undefined;
      }

      const manifest = await readManifest(options.config);
      const stored = manifest.artifacts.find((entry) => entry.id === artifactId);

      if (!stored) {
        return undefined;
      }

      return toRegisteredArtifact(row, stored, []);
    },

    resolveArtifactPath(storageKey: string): string {
      return resolveArtifactStoragePath(options.config, storageKey);
    },
  };
}

function mapArtifact(row: ArtifactRow, shareLinks: ArtifactShareLink[]): Artifact {
  return artifactSchema.parse({
    id: row.id,
    conversationId: row.conversation_id,
    title: row.title,
    description: row.description ?? undefined,
    type: row.type,
    link: row.link,
    createdAt: row.created_at.toISOString(),
    shareLinks,
  });
}

function toRegisteredArtifact(
  row: ArtifactRow,
  published: z.infer<typeof publishedArtifactSchema>,
  shareLinks: ArtifactShareLink[],
): RegisteredArtifact {
  return registeredArtifactSchema.parse({
    id: row.id,
    conversationId: row.conversation_id,
    title: row.title,
    description: row.description ?? undefined,
    type: "file",
    link: row.link,
    createdAt: row.created_at.toISOString(),
    originalFilename: published.originalFilename,
    mimeType: published.mimeType,
    sizeBytes: published.sizeBytes,
    checksum: published.checksum,
    storageKey: published.storageKey,
    shareLinks,
  });
}

function mapShareLink(row: typeof artifact_share_links.$inferSelect): ArtifactShareLink {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    expiresAt: row.expires_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    downloadCount: row.download_count,
    createdAt: row.created_at.toISOString(),
  };
}

function manifestPath(config: RuntimeConfig): string {
  return resolve(config.paths.subdirectories.sessions, ARTIFACT_MANIFEST_FILE);
}

async function readManifest(
  config: RuntimeConfig,
): Promise<z.infer<typeof artifactManifestSchema>> {
  const path = manifestPath(config);

  try {
    const raw = await readFile(path, "utf8");
    return artifactManifestSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, artifacts: [] };
    }

    throw error;
  }
}

async function writeManifest(
  config: RuntimeConfig,
  manifest: z.infer<typeof artifactManifestSchema>,
): Promise<void> {
  await writeConfigFileAtomic(manifestPath(config), artifactManifestSchema.parse(manifest));
}

function validateFilename(path: string | undefined): string {
  if (!path) {
    throw new BadRequestError("Artifact path is missing.");
  }

  const filename = basename(path.trim());

  if (filename.length === 0 || filename === "." || filename === "..") {
    throw new BadRequestError("Artifact filename is invalid.");
  }

  return filename;
}

function resolveMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase() as keyof typeof ARTIFACT_MIME_TYPES;
  return ARTIFACT_MIME_TYPES[ext] ?? "application/octet-stream";
}

function resolveWorkspaceSourcePath(config: RuntimeConfig, path: string | undefined): string {
  if (!path) {
    throw new BadRequestError("Artifact path is missing.");
  }

  const trimmed = path.trim();

  if (trimmed.length === 0 || trimmed.startsWith("/") || trimmed === "." || trimmed === "..") {
    throw new BadRequestError("Artifact path is invalid.");
  }

  const sourcePath = resolve(config.paths.workspaceDir, trimmed);
  ensureDescendant(sourcePath, config.paths.workspaceDir, "Artifact path must stay in workspace.");
  return sourcePath;
}

function resolveArtifactStoragePath(config: RuntimeConfig, storageKey: string): string {
  const parts = storageKey.split("/");

  if (
    parts.length !== 3 ||
    parts[0] !== "artifacts" ||
    parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new BadRequestError("Artifact storage key is invalid.");
  }

  const path = resolve(config.paths.subdirectories.sessions, ...parts);
  ensureDescendant(path, config.paths.subdirectories.sessions, "Artifact storage key is invalid.");
  return path;
}

function ensureDescendant(candidatePath: string, rootPath: string, message: string): void {
  const rel = relative(rootPath, candidatePath);

  if (rel === "" || rel.startsWith("..") || rel.startsWith(sep)) {
    throw new BadRequestError(message);
  }
}
