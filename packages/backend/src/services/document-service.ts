import type { Stats } from "node:fs";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, extname, isAbsolute, join, posix, relative, resolve } from "node:path";

import { and, eq, isNull } from "drizzle-orm";
import type { Logger } from "pino";

import {
  documentListFilterSchema,
  NEW_DOCUMENT_SUBFOLDER_MESSAGE,
  type CreateDocumentInput,
  type DocumentFolderEntry,
  type DocumentFolderListingResponse,
  type DocumentListFilter,
  type DocumentListItem,
  type DocumentListResponse,
  type DocumentReadResponse,
  type DocumentScope,
  type DocumentTreeNode,
  type PrivateDocumentTreeGroup,
  type SaveDocumentContentInput,
  type UpdateDocumentMetadataInput,
} from "@cc/shared/schemas";

import type { AppDb } from "../db/client.js";
import { createId, now } from "../db/ids.js";
import { documents } from "../db/schema/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { WorkspaceReconciler } from "../lib/workspace-reconciler.js";
import { resolveSpecialistWorkspacePath } from "./specialist-workspace.js";

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

type ScopeInput = {
  scope?: DocumentScope;
  ownerSlug?: string | null;
  ownerSpecialistId?: string | null;
};

type ResolvedScope = {
  scope: DocumentScope;
  ownerSlug: string | null;
  ownerSpecialistId: string | null;
  root: string;
};

type ScopedPathInput = ScopeInput & {
  relativePath: string;
};

type ReadDocumentInput = string | (ScopedPathInput & { maxContentBytes?: number });

type ListDocumentsInput = ScopeInput & {
  filter?: Partial<DocumentListFilter>;
};

type ListSearchCandidatesInput = ScopeInput & {
  maxCandidates: number;
};

type CollectFilesOptions = {
  maxItems?: number;
  includeDescription?: boolean;
};

type ServiceCreateDocumentInput = Omit<CreateDocumentInput, "scope"> & {
  scope?: DocumentScope;
  ownerSpecialistId?: string | null;
};

type ServiceUpdateMetadataInput = Omit<UpdateDocumentMetadataInput, "scope"> & {
  scope?: DocumentScope;
  ownerSpecialistId?: string | null;
};

type ServiceSaveContentInput = Omit<SaveDocumentContentInput, "scope"> & {
  scope?: DocumentScope;
  ownerSpecialistId?: string | null;
};

type ServiceMoveDocumentInput = ScopeInput & {
  fromPath: string;
  toPath: string;
};

function isMarkdownFile(name: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extname(name).toLowerCase());
}

function isHiddenOrExcluded(name: string): boolean {
  return name.startsWith(".") || name === "node_modules";
}

const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:/;

function validateRelativePath(path: string): void {
  if (!path || path.startsWith("/") || WINDOWS_DRIVE_PREFIX.test(path)) {
    throw new BadRequestError("Path must be relative.");
  }
  if (path.includes("\\")) {
    throw new BadRequestError("Path must use '/' separators, not backslashes.");
  }
  if (path.includes("..")) {
    throw new BadRequestError("Path must not contain '..'.");
  }
  const segments = path.split("/");
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

function validateNewDocumentPath(path: string): void {
  if (!path.includes("/")) {
    throw new BadRequestError(NEW_DOCUMENT_SUBFOLDER_MESSAGE);
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

function assertDescendant(root: string, absolutePath: string): void {
  const rel = relative(root, absolutePath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new BadRequestError("Document path escapes the scoped Documents root.");
  }
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

function documentMatchesFilter(doc: DocumentListItem, filter: DocumentListFilter): boolean {
  const relativePath = doc.relativePath.toLowerCase();
  const title = doc.title.toLowerCase();
  const description = doc.description?.toLowerCase() ?? "";
  const query = filter.query?.toLowerCase();

  if (
    query &&
    !relativePath.includes(query) &&
    !title.includes(query) &&
    !description.includes(query)
  ) {
    return false;
  }
  if (filter.pathContains && !relativePath.includes(filter.pathContains.toLowerCase())) {
    return false;
  }
  if (filter.titleContains && !title.includes(filter.titleContains.toLowerCase())) {
    return false;
  }
  if (
    filter.descriptionContains &&
    !description.includes(filter.descriptionContains.toLowerCase())
  ) {
    return false;
  }

  return true;
}

function nextOffset(offset: number, limit: number, total: number): number | null {
  const next = offset + limit;
  return next < total ? next : null;
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

  async function resolveScope(input: ScopeInput = {}): Promise<ResolvedScope> {
    const scope = input.scope ?? "global";

    if (scope === "global") {
      return {
        scope,
        ownerSlug: null,
        ownerSpecialistId: null,
        root: documentsRoot(),
      };
    }

    if (!input.ownerSpecialistId && !input.ownerSlug) {
      throw new BadRequestError("Private document owner is required.");
    }

    const row = await db.query.agents.findFirst({
      where: (table, operators) =>
        operators.and(
          input.ownerSpecialistId
            ? operators.eq(table.id, input.ownerSpecialistId)
            : operators.eq(table.slug, input.ownerSlug ?? ""),
          operators.eq(table.status, "active"),
        ),
      columns: { id: true, slug: true, name: true, status: true },
    });

    if (!row) {
      throw new NotFoundError("Private document owner not found.");
    }

    if (!input.ownerSpecialistId && input.ownerSlug && input.ownerSlug !== row.slug) {
      throw new BadRequestError("Private document owner does not match current specialist slug.");
    }

    return {
      scope,
      ownerSlug: row.slug,
      ownerSpecialistId: row.id,
      root: join(
        resolveSpecialistWorkspacePath({ config, slug: row.slug, status: "active" }),
        "Documents",
      ),
    };
  }

  async function resolveScopedPath(
    input: ScopedPathInput,
  ): Promise<ResolvedScope & { path: string }> {
    const target = await resolveScope(input);
    const path = resolve(target.root, input.relativePath);
    assertDescendant(target.root, path);
    return { ...target, path };
  }

  async function safeFileStat(target: ResolvedScope, relativePath: string): Promise<Stats | null> {
    const root = await realpath(target.root).catch(() => null);
    const path = await realpath(resolve(target.root, relativePath)).catch(() => null);
    if (!root || !path) {
      return null;
    }

    try {
      assertDescendant(root, path);
    } catch {
      return null;
    }

    let current = target.root;
    for (const segment of relativePath.split("/")) {
      current = join(current, segment);
      const currentStat = await lstat(current, { bigint: false }).catch(() => null);
      if (!currentStat || currentStat.isSymbolicLink()) {
        return null;
      }
    }

    const fileStat = await lstat(resolve(target.root, relativePath), { bigint: false }).catch(
      () => null,
    );
    if (!fileStat?.isFile()) {
      return null;
    }
    return await stat(resolve(target.root, relativePath), { bigint: false }).catch(() => null);
  }

  function documentWhere(target: ResolvedScope, relativePath: string) {
    if (target.scope === "global") {
      return and(
        eq(documents.scope, "global"),
        isNull(documents.owner_slug),
        isNull(documents.owner_specialist_id),
        eq(documents.relative_path, relativePath),
      );
    }

    return and(
      eq(documents.scope, "private"),
      eq(documents.owner_specialist_id, target.ownerSpecialistId ?? ""),
      eq(documents.relative_path, relativePath),
    );
  }

  async function findDocumentRow(target: ResolvedScope, relativePath: string) {
    return db.query.documents.findFirst({
      where: () => documentWhere(target, relativePath),
    });
  }

  async function scanTree(
    target: ResolvedScope,
    dir: string,
    relativeBase: string,
  ): Promise<DocumentTreeNode[]> {
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
      const entryStat = await lstat(entryPath).catch(() => null);
      if (!entryStat) continue;

      if (entryStat.isDirectory()) {
        const children = await scanTree(target, entryPath, entryRelative);
        nodes.push({
          scope: target.scope,
          ownerSlug: target.ownerSlug,
          ownerSpecialistId: target.ownerSpecialistId,
          name: entry,
          relativePath: entryRelative,
          type: "directory",
          title: null,
          children,
        });
      } else if (entryStat.isFile() && isMarkdownFile(entry)) {
        const row = await findDocumentRow(target, entryRelative);
        nodes.push({
          scope: target.scope,
          ownerSlug: target.ownerSlug,
          ownerSpecialistId: target.ownerSpecialistId,
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

  async function collectFiles(
    target: ResolvedScope,
    dir: string,
    relativeBase: string,
    items: DocumentListItem[],
    options: CollectFilesOptions = {},
  ): Promise<void> {
    if (options.maxItems !== undefined && items.length >= options.maxItems) {
      return;
    }
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries.filter((e) => !isHiddenOrExcluded(e)).sort()) {
      if (options.maxItems !== undefined && items.length >= options.maxItems) {
        return;
      }
      const entryPath = join(dir, entry);
      const entryRelative = toPosixPath(relativeBase ? `${relativeBase}/${entry}` : entry);
      const entryStat = await lstat(entryPath).catch(() => null);
      if (!entryStat) continue;

      if (entryStat.isDirectory()) {
        await collectFiles(target, entryPath, entryRelative, items, options);
      } else if (entryStat.isFile() && isMarkdownFile(entry)) {
        const row = await findDocumentRow(target, entryRelative);

        let description = row?.description ?? null;
        if (
          options.includeDescription !== false &&
          !description &&
          entryStat.size <= MAX_CONTENT_BYTES
        ) {
          const content = await readFile(entryPath, "utf8").catch(() => "");
          description = descriptionFromContent(content);
        }

        items.push({
          scope: target.scope,
          ownerSlug: target.ownerSlug,
          ownerSpecialistId: target.ownerSpecialistId,
          relativePath: entryRelative,
          fullPath: entryPath,
          title: row?.title ?? titleFromFilename(entry),
          description,
          author: row?.author ?? null,
        });
      }
    }
  }

  async function listGlobalDocuments(): Promise<DocumentListItem[]> {
    return listAllDocuments({ scope: "global" });
  }

  async function listAllDocuments(input: ScopeInput): Promise<DocumentListItem[]> {
    const target = await resolveScope(input);
    const items: DocumentListItem[] = [];
    await collectFiles(target, target.root, "", items);
    return items.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }

  async function listScopedDocuments(input: ListDocumentsInput): Promise<DocumentListResponse> {
    const target = await resolveScope(input);
    const filter = documentListFilterSchema.parse(input.filter ?? {});
    const items: DocumentListItem[] = [];
    await collectFiles(target, target.root, "", items);

    const documentsForPage = items
      .filter((doc) => documentMatchesFilter(doc, filter))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    const totalMatches = documentsForPage.length;
    const page = documentsForPage.slice(filter.offset, filter.offset + filter.limit);

    return {
      documents: page,
      totalMatches,
      nextOffset: nextOffset(filter.offset, filter.limit, totalMatches),
    };
  }

  async function listSearchCandidates(
    input: ListSearchCandidatesInput,
  ): Promise<DocumentListItem[]> {
    const target = await resolveScope(input);
    const items: DocumentListItem[] = [];
    await collectFiles(target, target.root, "", items, {
      maxItems: input.maxCandidates,
      includeDescription: false,
    });
    return items.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }

  function list(): Promise<DocumentListItem[]>;
  function list(input: ListDocumentsInput): Promise<DocumentListResponse>;
  async function list(
    input?: ListDocumentsInput,
  ): Promise<DocumentListItem[] | DocumentListResponse> {
    if (!input) {
      return listGlobalDocuments();
    }

    return listScopedDocuments(input);
  }

  async function getTree(input?: ScopeInput): Promise<DocumentTreeNode[]> {
    const target = await resolveScope(input);
    return scanTree(target, target.root, "");
  }

  // List the immediate children of a single folder. Unlike scanTree (recursive,
  // markdown-only) this is one level deep and includes every file so the folder
  // page can render the full directory. Markdown files are flagged
  // `isDocument: true` (openable in the editor); all other files are returned
  // but not openable. An empty `path` lists the scope root.
  async function listFolder(
    input: ScopeInput & { path?: string },
  ): Promise<DocumentFolderListingResponse> {
    const relativePath = (input.path ?? "").trim();
    if (relativePath) {
      validateRelativePath(relativePath);
    }

    const target = await resolveScope(input);
    const dir = relativePath ? resolve(target.root, relativePath) : target.root;
    assertDescendant(target.root, dir);

    const dirStat = await stat(dir).catch(() => null);
    if (!dirStat) {
      throw new NotFoundError(`Folder not found: ${relativePath || "/"}`);
    }
    if (!dirStat.isDirectory()) {
      throw new BadRequestError("Path is not a folder.");
    }

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      entries = [];
    }

    const directories: DocumentFolderEntry[] = [];
    const files: DocumentFolderEntry[] = [];

    for (const entry of entries.filter((e) => !isHiddenOrExcluded(e)).sort()) {
      const entryPath = join(dir, entry);
      const entryRelative = toPosixPath(relativePath ? `${relativePath}/${entry}` : entry);
      const entryStat = await lstat(entryPath).catch(() => null);
      if (!entryStat) continue;

      if (entryStat.isDirectory()) {
        directories.push({
          scope: target.scope,
          ownerSlug: target.ownerSlug,
          ownerSpecialistId: target.ownerSpecialistId,
          name: entry,
          relativePath: entryRelative,
          type: "directory",
          isDocument: false,
          title: null,
        });
      } else if (entryStat.isFile()) {
        const isDocument = isMarkdownFile(entry);
        const row = isDocument ? await findDocumentRow(target, entryRelative) : null;
        files.push({
          scope: target.scope,
          ownerSlug: target.ownerSlug,
          ownerSpecialistId: target.ownerSpecialistId,
          name: entry,
          relativePath: entryRelative,
          type: "file",
          isDocument,
          title: isDocument ? (row?.title ?? titleFromFilename(entry)) : null,
        });
      }
    }

    return {
      scope: target.scope,
      ownerSlug: target.ownerSlug,
      path: relativePath,
      entries: [...directories, ...files],
    };
  }

  async function getPrivateTreeGroups(): Promise<PrivateDocumentTreeGroup[]> {
    const rows = await db.query.agents.findMany({
      where: (table, operators) => operators.eq(table.status, "active"),
      columns: { id: true, slug: true, name: true },
      orderBy: (table, operators) => [operators.asc(table.name)],
    });
    const groups: PrivateDocumentTreeGroup[] = [];

    for (const row of rows) {
      const target = await resolveScope({
        scope: "private",
        ownerSpecialistId: row.id,
      });
      const rootStat = await stat(target.root).catch(() => null);
      if (!rootStat?.isDirectory()) {
        continue;
      }

      const tree = await scanTree(target, target.root, "");
      if (tree.length === 0) {
        continue;
      }

      groups.push({
        ownerSlug: row.slug,
        ownerSpecialistId: row.id,
        ownerName: row.name,
        tree,
      });
    }

    return groups;
  }

  async function read(input: ReadDocumentInput): Promise<DocumentReadResponse> {
    const scopedInput =
      typeof input === "string" ? { scope: "global" as const, relativePath: input } : input;
    validateDocumentPath(scopedInput.relativePath);
    const target = await resolveScopedPath(scopedInput);

    const fileStat = await safeFileStat(target, scopedInput.relativePath);
    if (!fileStat) {
      throw new NotFoundError(`Document not found: ${scopedInput.relativePath}`);
    }

    const maxContentBytes = Math.min(
      MAX_CONTENT_BYTES,
      scopedInput.maxContentBytes ?? MAX_CONTENT_BYTES,
    );
    if (fileStat.size > maxContentBytes) {
      throw new BadRequestError("Document is too large to read.");
    }

    const content = await readFile(target.path, "utf8");
    const row = await findDocumentRow(target, scopedInput.relativePath);

    return {
      scope: target.scope,
      ownerSlug: target.ownerSlug,
      ownerSpecialistId: target.ownerSpecialistId,
      relativePath: scopedInput.relativePath,
      fullPath: target.path,
      title: row?.title ?? titleFromFilename(basename(scopedInput.relativePath)),
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
  }

  async function create(input: ServiceCreateDocumentInput): Promise<DocumentListItem> {
    validateDocumentPath(input.path);
    validateNewDocumentPath(input.path);
    const target = await resolveScopedPath({
      scope: input.scope,
      ownerSlug: input.ownerSlug,
      ownerSpecialistId: input.ownerSpecialistId,
      relativePath: input.path,
    });

    const exists = await stat(target.path).catch(() => null);
    if (exists) {
      throw new ConflictError(`Document already exists: ${input.path}`);
    }

    const content = input.content ?? "";
    assertContentSize(content);

    await mkdir(resolve(target.path, ".."), { recursive: true });
    await writeFile(target.path, content, "utf8");

    const timestamp = now();
    await db.insert(documents).values({
      id: createId(),
      scope: target.scope,
      owner_slug: target.ownerSlug,
      owner_specialist_id: target.ownerSpecialistId,
      relative_path: input.path,
      title: input.title ?? null,
      description: input.description ?? null,
      author: input.author ?? null,
      created_at: timestamp,
      updated_at: timestamp,
      last_seen_at: timestamp,
    });

    return {
      scope: target.scope,
      ownerSlug: target.ownerSlug,
      ownerSpecialistId: target.ownerSpecialistId,
      relativePath: input.path,
      fullPath: target.path,
      title: input.title ?? titleFromFilename(basename(input.path)),
      description: input.description ?? descriptionFromContent(content),
      author: input.author ?? null,
    };
  }

  // Move (rename) a document within a single scoped root, carrying its DB
  // metadata row (id, title, description, author, timestamps) to the new path so
  // the manual-mv problem — where the reconciler would drop the old row and
  // reinsert a fresh one with a new id and null metadata — is avoided. Missing
  // destination folders are created automatically under the scoped root.
  async function move(input: ServiceMoveDocumentInput): Promise<DocumentListItem> {
    validateDocumentPath(input.fromPath);
    validateDocumentPath(input.toPath);
    validateNewDocumentPath(input.toPath);

    const scopeInput = {
      scope: input.scope,
      ownerSlug: input.ownerSlug,
      ownerSpecialistId: input.ownerSpecialistId,
    };
    const from = await resolveScopedPath({ ...scopeInput, relativePath: input.fromPath });
    const to = await resolveScopedPath({ ...scopeInput, relativePath: input.toPath });

    if (from.path === to.path) {
      throw new BadRequestError("Source and destination paths are the same.");
    }

    const sourceStat = await stat(from.path).catch(() => null);
    if (!sourceStat?.isFile()) {
      throw new NotFoundError(`Document not found: ${input.fromPath}`);
    }

    const destExists = await stat(to.path).catch(() => null);
    if (destExists) {
      throw new ConflictError(`Document already exists: ${input.toPath}`);
    }

    await mkdir(resolve(to.path, ".."), { recursive: true });
    await rename(from.path, to.path);

    // The file has already moved. If the metadata write fails, roll the file
    // back to its original path (best effort) so the filesystem and DB do not
    // drift — otherwise the next reconcile would drop the old row and reindex the
    // moved file as a fresh document, losing the very metadata this preserves.
    try {
      const timestamp = now();
      const existing = await findDocumentRow(from, input.fromPath);
      if (existing) {
        await db
          .update(documents)
          .set({
            owner_slug: to.ownerSlug,
            relative_path: input.toPath,
            updated_at: timestamp,
            last_seen_at: timestamp,
          })
          .where(documentWhere(from, input.fromPath));
      } else {
        await db.insert(documents).values({
          id: createId(),
          scope: to.scope,
          owner_slug: to.ownerSlug,
          owner_specialist_id: to.ownerSpecialistId,
          relative_path: input.toPath,
          title: null,
          description: null,
          author: null,
          created_at: timestamp,
          updated_at: timestamp,
          last_seen_at: timestamp,
        });
      }
    } catch (error) {
      await rename(to.path, from.path).catch(() => undefined);
      throw error;
    }

    const row = await findDocumentRow(to, input.toPath);
    const content = await readFile(to.path, "utf8").catch(() => "");

    return {
      scope: to.scope,
      ownerSlug: to.ownerSlug,
      ownerSpecialistId: to.ownerSpecialistId,
      relativePath: input.toPath,
      fullPath: to.path,
      title: row?.title ?? titleFromFilename(basename(input.toPath)),
      description: row?.description ?? descriptionFromContent(content),
      author: row?.author ?? null,
    };
  }

  async function createFolder(
    pathOrInput: string | (ScopeInput & { path: string }),
  ): Promise<void> {
    const input =
      typeof pathOrInput === "string"
        ? { scope: "global" as const, path: pathOrInput }
        : pathOrInput;
    validateRelativePath(input.path);
    const target = await resolveScopedPath({ ...input, relativePath: input.path });
    await mkdir(target.path, { recursive: true });
  }

  async function saveContent(
    input: ServiceSaveContentInput,
  ): Promise<{ revision: { mtimeMs: number; sizeBytes: number } }> {
    validateDocumentPath(input.path);
    assertContentSize(input.content);
    const target = await resolveScopedPath({
      scope: input.scope,
      ownerSlug: input.ownerSlug,
      ownerSpecialistId: input.ownerSpecialistId,
      relativePath: input.path,
    });

    let currentStat;
    try {
      currentStat = await stat(target.path);
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

    await writeFile(target.path, input.content, "utf8");

    const newStat = await stat(target.path);
    const timestamp = now();
    const existing = await findDocumentRow(target, input.path);
    if (existing) {
      await db
        .update(documents)
        .set({
          owner_slug: target.ownerSlug,
          updated_at: timestamp,
          last_seen_at: timestamp,
        })
        .where(documentWhere(target, input.path));
    }

    return {
      revision: {
        mtimeMs: newStat.mtimeMs,
        sizeBytes: newStat.size,
      },
    };
  }

  async function updateMetadata(input: ServiceUpdateMetadataInput): Promise<DocumentListItem> {
    validateDocumentPath(input.path);
    const target = await resolveScopedPath({
      scope: input.scope,
      ownerSlug: input.ownerSlug,
      ownerSpecialistId: input.ownerSpecialistId,
      relativePath: input.path,
    });

    const fileStat = await stat(target.path).catch(() => null);
    if (!fileStat) {
      throw new NotFoundError(`Document not found: ${input.path}`);
    }

    const timestamp = now();
    const existing = await findDocumentRow(target, input.path);

    if (existing) {
      const updates: Record<string, unknown> = {
        owner_slug: target.ownerSlug,
        updated_at: timestamp,
        last_seen_at: timestamp,
      };
      if (input.title !== undefined) updates["title"] = input.title;
      if (input.description !== undefined) updates["description"] = input.description;
      if (input.author !== undefined) updates["author"] = input.author;
      await db.update(documents).set(updates).where(documentWhere(target, input.path));
    } else {
      await db.insert(documents).values({
        id: createId(),
        scope: target.scope,
        owner_slug: target.ownerSlug,
        owner_specialist_id: target.ownerSpecialistId,
        relative_path: input.path,
        title: input.title ?? null,
        description: input.description ?? null,
        author: input.author ?? null,
        created_at: timestamp,
        updated_at: timestamp,
        last_seen_at: timestamp,
      });
    }

    const content = await readFile(target.path, "utf8").catch(() => "");

    return {
      scope: target.scope,
      ownerSlug: target.ownerSlug,
      ownerSpecialistId: target.ownerSpecialistId,
      relativePath: input.path,
      fullPath: target.path,
      title: input.title ?? existing?.title ?? titleFromFilename(basename(input.path)),
      description: input.description ?? existing?.description ?? descriptionFromContent(content),
      author: input.author ?? existing?.author ?? null,
    };
  }

  async function search(query: string): Promise<DocumentListItem[]> {
    const result = await listScopedDocuments({ scope: "global", filter: { query, limit: 200 } });
    return result.documents;
  }

  async function upsertFromFilesystem(input: string | ScopedPathInput): Promise<void> {
    const scopedInput =
      typeof input === "string" ? { scope: "global" as const, relativePath: input } : input;
    const target = await resolveScopedPath(scopedInput);
    const fileStat = await stat(target.path).catch(() => null);
    if (!fileStat || !fileStat.isFile()) return;

    const timestamp = now();
    const existing = await findDocumentRow(target, scopedInput.relativePath);

    if (existing) {
      await db
        .update(documents)
        .set({ owner_slug: target.ownerSlug, last_seen_at: timestamp })
        .where(documentWhere(target, scopedInput.relativePath));
    } else {
      await db.insert(documents).values({
        id: createId(),
        scope: target.scope,
        owner_slug: target.ownerSlug,
        owner_specialist_id: target.ownerSpecialistId,
        relative_path: scopedInput.relativePath,
        title: null,
        description: null,
        author: null,
        created_at: timestamp,
        updated_at: timestamp,
        last_seen_at: timestamp,
      });
    }
  }

  return {
    documentsRoot,
    fullPath,

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

    getTree,
    getPrivateTreeGroups,
    listFolder,
    list,
    listAllDocuments,
    listSearchCandidates,
    read,
    create,
    move,
    createFolder,
    saveContent,
    updateMetadata,
    search,
    upsertFromFilesystem,
  };
}

export const documentReconciler: WorkspaceReconciler = {
  name: "documents",

  async reconcile({ config, db, logger }) {
    const service = createDocumentService({ config, db, logger });
    const globalTarget = {
      scope: "global" as const,
      ownerSlug: null,
      ownerSpecialistId: null,
      root: config.paths.subdirectories.documents,
    };

    await reconcileRoot(globalTarget, db, service, logger);

    const activeSpecialists = await db.query.agents.findMany({
      where: (table, operators) => operators.eq(table.status, "active"),
      columns: { id: true, slug: true },
    });

    for (const specialist of activeSpecialists) {
      const root = join(
        resolveSpecialistWorkspacePath({ config, slug: specialist.slug, status: "active" }),
        "Documents",
      );
      const rootStat = await stat(root).catch(() => null);
      if (!rootStat?.isDirectory()) {
        continue;
      }

      await reconcileRoot(
        {
          scope: "private",
          ownerSlug: specialist.slug,
          ownerSpecialistId: specialist.id,
          root,
        },
        db,
        service,
        logger,
      );
    }
  },
};

async function reconcileRoot(
  target: ResolvedScope,
  db: AppDb,
  service: DocumentService,
  logger: Logger,
): Promise<void> {
  const rootStat = await stat(target.root).catch(() => null);
  if (!rootStat?.isDirectory()) return;

  const seenPaths = new Set<string>();
  await discoverFiles(target, target.root, "", seenPaths, service, logger);

  const rows =
    target.scope === "global"
      ? await db
          .select({ id: documents.id, relative_path: documents.relative_path })
          .from(documents)
          .where(
            and(
              eq(documents.scope, "global"),
              isNull(documents.owner_slug),
              isNull(documents.owner_specialist_id),
            ),
          )
      : await db
          .select({ id: documents.id, relative_path: documents.relative_path })
          .from(documents)
          .where(
            and(
              eq(documents.scope, "private"),
              eq(documents.owner_specialist_id, target.ownerSpecialistId ?? ""),
            ),
          );

  for (const row of rows) {
    if (!seenPaths.has(row.relative_path)) {
      await db.delete(documents).where(eq(documents.id, row.id));
    }
  }
}

async function discoverFiles(
  target: ResolvedScope,
  dir: string,
  relativeBase: string,
  seenPaths: Set<string>,
  service: DocumentService,
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
      await discoverFiles(target, entryPath, entryRelative, seenPaths, service, _logger);
    } else if (entryStat.isFile() && isMarkdownFile(entry)) {
      seenPaths.add(entryRelative);
      await service.upsertFromFilesystem({
        scope: target.scope,
        ownerSlug: target.ownerSlug,
        ownerSpecialistId: target.ownerSpecialistId,
        relativePath: entryRelative,
      });
    }
  }
}
