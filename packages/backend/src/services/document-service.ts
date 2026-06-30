import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, posix, relative, resolve } from "node:path";

import { eq } from "drizzle-orm";
import type { Logger } from "pino";

import type {
  CreateDocumentInput,
  DocumentListItem,
  DocumentReadResponse,
  DocumentTreeNode,
  SaveDocumentContentInput,
  UpdateDocumentMetadataInput,
} from "@cc/shared/schemas";

import type { AppDb } from "../db/client.js";
import { createId, now } from "../db/ids.js";
import { documents } from "../db/schema/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { WorkspaceReconciler } from "../lib/workspace-reconciler.js";

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

function isMarkdownFile(name: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extname(name).toLowerCase());
}

function isHiddenOrExcluded(name: string): boolean {
  return name.startsWith(".") || name === "node_modules";
}

// Split on both POSIX (`/`) and Windows (`\`) separators so a backslash path
// can't smuggle a hidden segment past the per-segment checks (e.g. on Windows
// `foo\.hidden\bar.md` would otherwise be treated as a single segment).
const PATH_SEPARATORS = /[\\/]/;
// Windows drive-letter prefix (e.g. `C:` in `C:\notes.md`), which is absolute
// on Windows even without a leading separator — `resolve()` would then ignore
// the Documents root and target an arbitrary location.
const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:/;

function validateRelativePath(path: string): void {
  if (!path || PATH_SEPARATORS.test(path[0] ?? "") || WINDOWS_DRIVE_PREFIX.test(path)) {
    throw new BadRequestError("Path must be relative.");
  }
  if (path.includes("..")) {
    throw new BadRequestError("Path must not contain '..'.");
  }
  const segments = path.split(PATH_SEPARATORS);
  if (segments.some((s) => s === "" || s.startsWith("."))) {
    throw new BadRequestError("Path must not contain empty or hidden segments.");
  }
}

function validateDocumentPath(path: string): void {
  validateRelativePath(path);
  if (!MARKDOWN_EXTENSIONS.has(extname(path).toLowerCase())) {
    throw new BadRequestError("Path must end with .md or .markdown.");
  }
}

function assertContentSize(content: string): void {
  if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES) {
    throw new BadRequestError("Document content exceeds the maximum allowed size.");
  }
}

function titleFromFilename(filename: string): string {
  const name = basename(filename, extname(filename));
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function descriptionFromContent(content: string): string | null {
  if (!content.trim()) return null;
  const stripped = content.replace(/^#+\s+.*$/m, "").trim();
  if (!stripped) return null;
  return stripped.slice(0, 200);
}

function toPosixPath(p: string): string {
  return p.split("/").join(posix.sep);
}

const ASSET_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

function contentTypeForPath(path: string): string {
  return ASSET_CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Normalizes a workspace asset reference into a workspace-root-relative POSIX
 * path. Accepts an optional `workspace:` scheme prefix and leading slashes.
 */
function normalizeWorkspaceAssetPath(path: string): string {
  let normalized = path.trim();
  if (!normalized) {
    throw new BadRequestError("Asset path is required.");
  }
  if (normalized.startsWith("workspace:")) {
    normalized = normalized.slice("workspace:".length);
  }
  normalized = normalized.replace(/^\/+/, "");
  if (!normalized) {
    throw new BadRequestError("Asset path is required.");
  }
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new BadRequestError("Asset path must not contain '..'.");
  }
  return normalized;
}

export type DocumentService = ReturnType<typeof createDocumentService>;

export function createDocumentService(options: {
  db: AppDb;
  config: RuntimeConfig;
  logger?: Logger;
}) {
  const { db, config } = options;

  function documentsRoot(): string {
    return config.paths.subdirectories.documents;
  }

  function fullPath(relativePath: string): string {
    return resolve(documentsRoot(), relativePath);
  }

  async function scanTree(dir: string, relativeBase: string): Promise<DocumentTreeNode[]> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }

    const nodes: DocumentTreeNode[] = [];

    const sorted = entries.filter((e) => !isHiddenOrExcluded(e)).sort();

    for (const entry of sorted) {
      const entryPath = join(dir, entry);
      const entryRelative = toPosixPath(relativeBase ? `${relativeBase}/${entry}` : entry);
      const entryStat = await stat(entryPath).catch(() => null);
      if (!entryStat) continue;

      if (entryStat.isDirectory()) {
        const children = await scanTree(entryPath, entryRelative);
        nodes.push({
          name: entry,
          relativePath: entryRelative,
          type: "directory",
          title: null,
          children,
        });
      } else if (entryStat.isFile() && isMarkdownFile(entry)) {
        const row = await db.query.documents.findFirst({
          where: (t, { eq: equals }) => equals(t.relative_path, entryRelative),
        });
        nodes.push({
          name: entry,
          relativePath: entryRelative,
          type: "file",
          title: row?.title ?? titleFromFilename(entry),
        });
      }
    }

    return [
      ...nodes.filter((n) => n.type === "directory"),
      ...nodes.filter((n) => n.type === "file"),
    ];
  }

  return {
    documentsRoot,
    fullPath,

    /**
     * Resolves a `workspace:`/workspace-relative asset reference to an absolute
     * path for serving, confined to the workspace root.
     */
    async resolveWorkspaceAsset(
      assetPath: string,
    ): Promise<{ absolutePath: string; contentType: string; sizeBytes: number }> {
      const normalized = normalizeWorkspaceAssetPath(assetPath);
      const workspaceRoot = config.paths.workspaceDir;
      const absolutePath = resolve(workspaceRoot, normalized);
      const rel = relative(workspaceRoot, absolutePath);
      if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new BadRequestError("Asset path escapes the workspace.");
      }

      const fileStat = await stat(absolutePath).catch(() => null);
      if (!fileStat || !fileStat.isFile()) {
        throw new NotFoundError(`Asset not found: ${normalized}`);
      }

      return {
        absolutePath,
        contentType: contentTypeForPath(absolutePath),
        sizeBytes: fileStat.size,
      };
    },

    async getTree(): Promise<DocumentTreeNode[]> {
      return scanTree(documentsRoot(), "");
    },

    async list(): Promise<DocumentListItem[]> {
      const root = documentsRoot();
      const items: DocumentListItem[] = [];
      await collectFiles(root, "", items);
      return items;
    },

    async read(relativePath: string): Promise<DocumentReadResponse> {
      validateDocumentPath(relativePath);
      const absPath = fullPath(relativePath);

      let fileStat;
      try {
        fileStat = await stat(absPath);
      } catch {
        throw new NotFoundError(`Document not found: ${relativePath}`);
      }

      if (fileStat.size > MAX_CONTENT_BYTES) {
        throw new BadRequestError("Document is too large to read.");
      }

      const content = await readFile(absPath, "utf8");
      const row = await db.query.documents.findFirst({
        where: (t, { eq: equals }) => equals(t.relative_path, relativePath),
      });

      return {
        relativePath,
        fullPath: absPath,
        title: row?.title ?? titleFromFilename(basename(relativePath)),
        description: row?.description ?? descriptionFromContent(content),
        author: row?.author ?? null,
        content,
        revision: {
          mtimeMs: fileStat.mtimeMs,
          sizeBytes: fileStat.size,
        },
        createdAt: row?.created_at ? row.created_at.getTime() : null,
        updatedAt: row?.updated_at ? row.updated_at.getTime() : null,
      };
    },

    async create(input: CreateDocumentInput): Promise<DocumentListItem> {
      validateDocumentPath(input.path);
      const absPath = fullPath(input.path);

      const exists = await stat(absPath).catch(() => null);
      if (exists) {
        throw new ConflictError(`Document already exists: ${input.path}`);
      }

      const content = input.content ?? "";
      assertContentSize(content);

      const parentDir = resolve(absPath, "..");
      await mkdir(parentDir, { recursive: true });

      await writeFile(absPath, content, "utf8");

      const id = createId();
      const timestamp = now();

      await db.insert(documents).values({
        id,
        relative_path: input.path,
        title: input.title ?? null,
        description: input.description ?? null,
        author: input.author ?? null,
        created_at: timestamp,
        updated_at: timestamp,
        last_seen_at: timestamp,
      });

      return {
        relativePath: input.path,
        fullPath: absPath,
        title: input.title ?? titleFromFilename(basename(input.path)),
        description: input.description ?? descriptionFromContent(content),
        author: input.author ?? null,
      };
    },

    async createFolder(path: string): Promise<void> {
      validateRelativePath(path);
      const absPath = fullPath(path);
      await mkdir(absPath, { recursive: true });
    },

    async saveContent(
      input: SaveDocumentContentInput,
    ): Promise<{ revision: { mtimeMs: number; sizeBytes: number } }> {
      validateDocumentPath(input.path);
      assertContentSize(input.content);
      const absPath = fullPath(input.path);

      let currentStat;
      try {
        currentStat = await stat(absPath);
      } catch {
        throw new NotFoundError(`Document not found: ${input.path}`);
      }

      if (
        currentStat.mtimeMs !== input.expectedRevision.mtimeMs ||
        currentStat.size !== input.expectedRevision.sizeBytes
      ) {
        throw new ConflictError("Document has been modified since last read.", {
          currentRevision: {
            mtimeMs: currentStat.mtimeMs,
            sizeBytes: currentStat.size,
          },
        });
      }

      await writeFile(absPath, input.content, "utf8");

      const newStat = await stat(absPath);

      const timestamp = now();
      const existing = await db.query.documents.findFirst({
        where: (t, { eq: equals }) => equals(t.relative_path, input.path),
      });
      if (existing) {
        await db
          .update(documents)
          .set({ updated_at: timestamp, last_seen_at: timestamp })
          .where(eq(documents.relative_path, input.path));
      }

      return {
        revision: {
          mtimeMs: newStat.mtimeMs,
          sizeBytes: newStat.size,
        },
      };
    },

    async updateMetadata(input: UpdateDocumentMetadataInput): Promise<DocumentListItem> {
      validateDocumentPath(input.path);
      const absPath = fullPath(input.path);

      const fileStat = await stat(absPath).catch(() => null);
      if (!fileStat) {
        throw new NotFoundError(`Document not found: ${input.path}`);
      }

      const timestamp = now();
      const existing = await db.query.documents.findFirst({
        where: (t, { eq: equals }) => equals(t.relative_path, input.path),
      });

      if (existing) {
        const updates: Record<string, unknown> = { updated_at: timestamp, last_seen_at: timestamp };
        if (input.title !== undefined) updates["title"] = input.title;
        if (input.description !== undefined) updates["description"] = input.description;
        if (input.author !== undefined) updates["author"] = input.author;
        await db.update(documents).set(updates).where(eq(documents.relative_path, input.path));
      } else {
        await db.insert(documents).values({
          id: createId(),
          relative_path: input.path,
          title: input.title ?? null,
          description: input.description ?? null,
          author: input.author ?? null,
          created_at: timestamp,
          updated_at: timestamp,
          last_seen_at: timestamp,
        });
      }

      const content = await readFile(absPath, "utf8").catch(() => "");

      return {
        relativePath: input.path,
        fullPath: absPath,
        title: input.title ?? existing?.title ?? titleFromFilename(basename(input.path)),
        description: input.description ?? existing?.description ?? descriptionFromContent(content),
        author: input.author ?? existing?.author ?? null,
      };
    },

    async search(query: string): Promise<DocumentListItem[]> {
      const lowerQuery = query.toLowerCase();
      const allDocs = await this.list();
      return allDocs.filter(
        (doc) =>
          doc.relativePath.toLowerCase().includes(lowerQuery) ||
          doc.title.toLowerCase().includes(lowerQuery) ||
          (doc.description && doc.description.toLowerCase().includes(lowerQuery)) ||
          (doc.author && doc.author.toLowerCase().includes(lowerQuery)),
      );
    },

    async upsertFromFilesystem(relativePath: string): Promise<void> {
      const absPath = fullPath(relativePath);
      const fileStat = await stat(absPath).catch(() => null);
      if (!fileStat || !fileStat.isFile()) return;

      const timestamp = now();
      const existing = await db.query.documents.findFirst({
        where: (t, { eq: equals }) => equals(t.relative_path, relativePath),
      });

      if (existing) {
        await db
          .update(documents)
          .set({ last_seen_at: timestamp })
          .where(eq(documents.relative_path, relativePath));
      } else {
        await db.insert(documents).values({
          id: createId(),
          relative_path: relativePath,
          title: null,
          description: null,
          author: null,
          created_at: timestamp,
          updated_at: timestamp,
          last_seen_at: timestamp,
        });
      }
    },
  };

  async function collectFiles(
    dir: string,
    relativeBase: string,
    items: DocumentListItem[],
  ): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries.filter((e) => !isHiddenOrExcluded(e)).sort()) {
      const entryPath = join(dir, entry);
      const entryRelative = toPosixPath(relativeBase ? `${relativeBase}/${entry}` : entry);
      const entryStat = await stat(entryPath).catch(() => null);
      if (!entryStat) continue;

      if (entryStat.isDirectory()) {
        await collectFiles(entryPath, entryRelative, items);
      } else if (entryStat.isFile() && isMarkdownFile(entry)) {
        const row = await db.query.documents.findFirst({
          where: (t, { eq: equals }) => equals(t.relative_path, entryRelative),
        });

        let description = row?.description ?? null;
        // Only read the file for a fallback description when it's within the
        // size cap. A very large .md dropped in directly (bypassing the
        // create/save cap) would otherwise make listing/search read it in full.
        if (!description && entryStat.size <= MAX_CONTENT_BYTES) {
          const content = await readFile(entryPath, "utf8").catch(() => "");
          description = descriptionFromContent(content);
        }

        items.push({
          relativePath: entryRelative,
          fullPath: entryPath,
          title: row?.title ?? titleFromFilename(entry),
          description,
          author: row?.author ?? null,
        });
      }
    }
  }
}

export const documentReconciler: WorkspaceReconciler = {
  name: "documents",

  async reconcile({ config, db, logger }) {
    const root = config.paths.subdirectories.documents;

    let rootStat;
    try {
      rootStat = await stat(root);
    } catch {
      return;
    }
    if (!rootStat.isDirectory()) return;

    const seenPaths = new Set<string>();
    await discoverFiles(root, "", seenPaths, db, logger);

    const rows = await db
      .select({ id: documents.id, relative_path: documents.relative_path })
      .from(documents);
    for (const row of rows) {
      if (!seenPaths.has(row.relative_path)) {
        await db.delete(documents).where(eq(documents.id, row.id));
      }
    }
  },
};

async function discoverFiles(
  dir: string,
  relativeBase: string,
  seenPaths: Set<string>,
  db: AppDb,
  _logger: Logger,
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (isHiddenOrExcluded(entry)) continue;

    const entryPath = join(dir, entry);
    const entryRelative = relativeBase ? `${relativeBase}/${entry}` : entry;
    const entryStat = await stat(entryPath).catch(() => null);
    if (!entryStat) continue;

    if (entryStat.isDirectory()) {
      await discoverFiles(entryPath, entryRelative, seenPaths, db, _logger);
    } else if (entryStat.isFile() && isMarkdownFile(entry)) {
      seenPaths.add(entryRelative);

      const existing = await db.query.documents.findFirst({
        where: (t, { eq: equals }) => equals(t.relative_path, entryRelative),
      });

      const timestamp = new Date();
      if (existing) {
        await db
          .update(documents)
          .set({ last_seen_at: timestamp })
          .where(eq(documents.relative_path, entryRelative));
      } else {
        await db.insert(documents).values({
          id: createId(),
          relative_path: entryRelative,
          title: null,
          description: null,
          author: null,
          created_at: timestamp,
          updated_at: timestamp,
          last_seen_at: timestamp,
        });
      }
    }
  }
}
