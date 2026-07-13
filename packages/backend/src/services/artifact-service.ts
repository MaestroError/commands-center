import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

import {
  artifactSchema,
  registeredArtifactSchema,
  type AddArtifactInput,
  type Artifact,
  type ArtifactShareLink,
  type DocumentScope,
  type RegisteredArtifact,
} from "@cc/shared/schemas";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { AppDb } from "../db/client.js";
import { agents, artifacts, conversations as conversationsTable } from "../db/schema/index.js";
import type { artifact_share_links } from "../db/schema/index.js";
import { createId, now } from "../db/ids.js";
import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import { writeConfigFileAtomic } from "../lib/config-file.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { resolveSpecialistWorkspacePath } from "./specialist-workspace.js";

// A document artifact's resolved location: the shared Documents module
// ("global") or a specialist's private Documents/ folder ("private").
type DocumentLocation = { scope: DocumentScope; ownerSlug: string | null };

// The private Documents/ root for a specialist, mirroring how document-service
// resolves private-scope documents.
function specialistDocumentsRoot(config: RuntimeConfig, slug: string): string {
  return join(resolveSpecialistWorkspacePath({ config, slug, status: "active" }), "Documents");
}

const ARTIFACT_MANIFEST_FILE = "published-artifacts.json";
const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:/;

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

  async function getArtifactAgentSlug(conversationId: string): Promise<string | undefined> {
    const [row] = await options.db
      .select({ slug: agents.slug })
      .from(conversationsTable)
      .innerJoin(agents, eq(conversationsTable.agent_id, agents.id))
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    return row?.slug;
  }

  return {
    async create(input: { conversationId: string } & AddArtifactInput): Promise<Artifact> {
      const conversation = await options.db.query.conversations.findFirst({
        where: (table, operators) => operators.eq(table.id, input.conversationId),
        columns: { id: true },
      });

      if (!conversation) {
        throw new NotFoundError("Conversation not found.");
      }

      const id = createId();
      const timestamp = now();
      const agentSlug = await getArtifactAgentSlug(input.conversationId);
      // For document artifacts, resolve whether the path lives in the owning
      // specialist's private Documents/ folder or the shared module, so both the
      // in-app link and the public share URL target the right root.
      const location = await resolveDocumentLocation(
        options.config,
        input.type,
        input.link,
        agentSlug,
      );

      await options.db.insert(artifacts).values({
        id,
        conversation_id: input.conversationId,
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        link: input.link,
        document_scope: location.scope,
        document_owner_slug: location.ownerSlug,
        created_at: timestamp,
      });

      const row = await getRow(id);

      if (!row) {
        throw new Error("Failed to create artifact record.");
      }

      return mapArtifact(options.config, row, [], agentSlug);
    },

    async listByConversation(conversationId: string): Promise<Artifact[]> {
      const rows = await options.db.query.artifacts.findMany({
        where: (table, operators) => operators.eq(table.conversation_id, conversationId),
        orderBy: (table, operators) => [operators.desc(table.created_at)],
      });

      const shareLinks = await listShareLinksByArtifactIds(rows.map((row) => row.id));
      const agentSlug = await getArtifactAgentSlug(conversationId);

      return Promise.all(
        rows.map((row) =>
          mapArtifact(options.config, row, shareLinks.get(row.id) ?? [], agentSlug),
        ),
      );
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
          agentSlug: agents.slug,
        })
        .from(artifacts)
        .innerJoin(conversationsTable, eq(artifacts.conversation_id, conversationsTable.id))
        .innerJoin(agents, eq(conversationsTable.agent_id, agents.id))
        .where(inArray(conversationsTable.task_run_id, runIds))
        .orderBy(desc(artifacts.created_at));

      const shareLinks = await listShareLinksByArtifactIds(rows.map((row) => row.artifact.id));

      for (const { runId, artifact, agentSlug } of rows) {
        if (!runId) {
          continue;
        }
        const mapped = await mapArtifact(
          options.config,
          artifact,
          shareLinks.get(artifact.id) ?? [],
          agentSlug,
        );
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
      const agentSlug = await getArtifactAgentSlug(row.conversation_id);
      return mapArtifact(options.config, row, shareLinks.get(artifactId) ?? [], agentSlug);
    },

    // Copy the artifact's workspace file into stable storage so a shared link
    // serves an immutable snapshot. Idempotent: re-publishing returns the
    // existing entry.
    async publishArtifact(artifactId: string): Promise<RegisteredArtifact> {
      const row = await getRow(artifactId);

      if (!row) {
        throw new NotFoundError("Artifact not found.");
      }

      if (row.type !== "file" && row.type !== "document") {
        throw new BadRequestError("Only file and document artifacts can be shared.");
      }

      const manifest = await readManifest(options.config);
      const existing = manifest.artifacts.find((entry) => entry.id === artifactId);

      if (existing) {
        return toRegisteredArtifact(row, existing, []);
      }

      const filename = validateFilename(row.link);
      const mimeType = resolveMimeType(filename);
      const agentSlug = await getArtifactAgentSlug(row.conversation_id);
      const sourcePath =
        row.type === "document"
          ? resolveDocumentSourcePath(
              options.config,
              row.link,
              row.document_scope,
              row.document_owner_slug,
            )
          : await resolveFileSourcePath(options.config, row.link, agentSlug);
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

      if (!row || (row.type !== "file" && row.type !== "document")) {
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

async function mapArtifact(
  config: RuntimeConfig,
  row: ArtifactRow,
  shareLinks: ArtifactShareLink[],
  agentSlug?: string,
): Promise<Artifact> {
  return artifactSchema.parse({
    id: row.id,
    conversationId: row.conversation_id,
    title: row.title,
    description: row.description ?? undefined,
    type: row.type,
    link: row.link,
    documentScope: row.document_scope,
    documentOwnerSlug: row.document_owner_slug,
    fileManagerPath: await resolveArtifactFileManagerPath(config, row, agentSlug),
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
    documentScope: row.document_scope,
    documentOwnerSlug: row.document_owner_slug,
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
  const filename = basename(validateRelativeArtifactPath(path));

  if (filename.length === 0 || filename === "." || filename === "..") {
    throw new BadRequestError("Artifact filename is invalid.");
  }

  return filename;
}

function resolveMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase() as keyof typeof ARTIFACT_MIME_TYPES;
  return ARTIFACT_MIME_TYPES[ext] ?? "application/octet-stream";
}

async function resolveFileSourcePath(
  config: RuntimeConfig,
  path: string | undefined,
  agentSlug: string | undefined,
): Promise<string> {
  const trimmed = validateRelativeArtifactPath(path);
  const roots = agentSlug
    ? [
        resolve(config.paths.subdirectories.specialists, agentSlug),
        resolve(config.paths.subdirectories.specialists, agentSlug, "Documents"),
        config.paths.workspaceDir,
      ]
    : [config.paths.workspaceDir];

  for (const root of roots) {
    const sourcePath = resolve(root, trimmed);
    ensureDescendant(sourcePath, root, "Artifact path must stay in workspace.");
    if (await isFile(sourcePath)) {
      return sourcePath;
    }
  }

  throw new NotFoundError("Artifact source file not found.");
}

function validateRelativeArtifactPath(path: string | undefined): string {
  if (!path) {
    throw new BadRequestError("Artifact path is missing.");
  }

  const trimmed = path.trim();

  if (
    trimmed.length === 0 ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    WINDOWS_DRIVE_PREFIX.test(trimmed) ||
    trimmed === "." ||
    trimmed === ".."
  ) {
    throw new BadRequestError("Artifact path is invalid.");
  }

  const segments = trimmed.split(/[\\/]/).filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new BadRequestError("Artifact path is invalid.");
  }

  return segments.join("/");
}

export async function resolveArtifactFileManagerPath(
  config: RuntimeConfig,
  row: ArtifactRow,
  agentSlug: string | undefined,
): Promise<string | undefined> {
  if (row.type !== "file" || !agentSlug) {
    return undefined;
  }

  const trimmed = row.link.trim();
  const segments = trimmed.split(/[\\/]/).filter(Boolean);
  if (
    trimmed.length === 0 ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    WINDOWS_DRIVE_PREFIX.test(trimmed) ||
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    return undefined;
  }

  const specialistPath = ["specialists", agentSlug, ...segments].join("/");
  const specialistDocumentsPath = ["specialists", agentSlug, "Documents", ...segments].join("/");
  const globalPath = segments.join("/");

  if (await isWorkspaceFile(config, specialistPath)) {
    return specialistPath;
  }

  if (await isWorkspaceFile(config, specialistDocumentsPath)) {
    return specialistDocumentsPath;
  }

  if (await isWorkspaceFile(config, globalPath)) {
    return undefined;
  }

  return specialistPath;
}

// Resolve a `document`-type artifact's Documents/-relative link to an absolute
// path, hardened against traversal (reuses the same descendant check as files).
function resolveDocumentSourcePath(
  config: RuntimeConfig,
  path: string | undefined,
  scope: DocumentScope,
  ownerSlug: string | null,
): string {
  const trimmed = validateRelativeArtifactPath(path);

  if (scope === "private") {
    if (!ownerSlug) {
      throw new BadRequestError("Private document artifact is missing its owner.");
    }
    const root = specialistDocumentsRoot(config, ownerSlug);
    const sourcePath = resolve(root, trimmed);
    ensureDescendant(
      sourcePath,
      root,
      "Artifact document path must stay in the owner's Documents.",
    );
    return sourcePath;
  }

  const root = config.paths.subdirectories.documents;
  const sourcePath = resolve(root, trimmed);
  ensureDescendant(sourcePath, root, "Artifact document path must stay in Documents.");
  return sourcePath;
}

// Resolve where a document artifact lives. A specialist that authored the
// artifact may have written it to its private Documents/ folder; if the path
// exists there, treat it as private and record the owner. Otherwise it belongs
// to the shared Documents module. Non-document artifacts are always global.
async function resolveDocumentLocation(
  config: RuntimeConfig,
  type: string,
  link: string,
  agentSlug: string | undefined,
): Promise<DocumentLocation> {
  if (type !== "document" || !agentSlug) {
    return { scope: "global", ownerSlug: null };
  }

  // Canonicalize the path exactly as publishing will (validateRelativeArtifactPath
  // normalizes backslashes to `/` and rejects absolute/traversal paths), so the
  // persisted scope agrees with how resolveDocumentSourcePath later resolves it —
  // otherwise a Windows-style path would probe as global here but publish under
  // the private root. Invalid paths fail fast at create time.
  const normalized = validateRelativeArtifactPath(link);
  const privateRoot = specialistDocumentsRoot(config, agentSlug);
  const privatePath = resolve(privateRoot, normalized);
  // Belt-and-suspenders: a path that escapes the private root isn't private.
  if (!isDescendant(privatePath, privateRoot)) {
    return { scope: "global", ownerSlug: null };
  }

  return (await isFile(privatePath))
    ? { scope: "private", ownerSlug: agentSlug }
    : { scope: "global", ownerSlug: null };
}

async function isFile(path: string): Promise<boolean> {
  return stat(path)
    .then((details) => details.isFile())
    .catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw error;
    });
}

async function isWorkspaceFile(config: RuntimeConfig, relativePath: string): Promise<boolean> {
  return isFile(resolve(config.paths.workspaceDir, relativePath));
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

function isDescendant(candidatePath: string, rootPath: string): boolean {
  const rel = relative(rootPath, candidatePath);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
}

function ensureDescendant(candidatePath: string, rootPath: string, message: string): void {
  if (!isDescendant(candidatePath, rootPath)) {
    throw new BadRequestError(message);
  }
}
