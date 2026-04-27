import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

import type { RuntimeConfig } from "../lib/runtime-config.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../lib/api-error.js";
import type {
  FileManagerCreateEntryInput,
  FileManagerDeleteEntryQuery,
  FileManagerFileContentResponse,
  FileManagerFileRevision,
  FileManagerListQuery,
  FileManagerListResponse,
  FileManagerNode,
  FileManagerRejectedUploadEntry,
  FileManagerRenameEntryInput,
  FileManagerRootKind,
  FileManagerSaveFileInput,
  FileManagerSaveFileResponse,
  FileManagerUploadInput,
  FileManagerUploadResponse,
} from "@cc/shared/schemas";

export const FILE_EDITOR_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
const DANGEROUS_UPLOAD_EXTENSIONS = new Set([
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".exe",
  ".msi",
  ".dll",
  ".bat",
  ".cmd",
  ".sh",
  ".app",
  ".pkg",
  ".dmg",
  ".iso",
]);

type RootReference = {
  kind: FileManagerRootKind;
  basePath: string;
};

type CriticalWorkspacePathRule = {
  resolvePath: (config: RuntimeConfig) => string;
  recursive?: boolean;
  reason: string;
};

type CriticalAgentPathRule = {
  relativePath: string;
  recursive?: boolean;
  reason: string;
};

const CRITICAL_WORKSPACE_PATH_RULES: CriticalWorkspacePathRule[] = [
  {
    resolvePath: (config) => config.paths.subdirectories.database,
    recursive: true,
    reason: "This path contains CommandsCenter database state required by the app.",
  },
  {
    resolvePath: (config) => config.paths.subdirectories.preferences,
    recursive: true,
    reason: "This path contains CommandsCenter preferences used by the app or agents.",
  },
  {
    resolvePath: (config) => config.paths.subdirectories.auth,
    recursive: true,
    reason: "This path contains authentication state used by provider or integration connections.",
  },
  {
    resolvePath: (config) => config.paths.subdirectories.mcp,
    recursive: true,
    reason: "This path contains MCP configuration and integration state managed by CommandsCenter.",
  },
  {
    resolvePath: (config) => config.paths.subdirectories.sessions,
    recursive: true,
    reason: "This path contains CommandsCenter session state managed by the app.",
  },
  {
    resolvePath: (config) => config.paths.subdirectories.automations,
    recursive: true,
    reason: "This path contains CommandsCenter automation state managed by the app.",
  },
  {
    resolvePath: (config) => config.paths.subdirectories.tools,
    recursive: true,
    reason: "This path contains CommandsCenter-managed reusable tools.",
  },
  {
    resolvePath: (config) => resolve(config.paths.workspaceDir, "opencode.jsonc"),
    reason: "This file stores workspace-level OpenCode configuration managed by CommandsCenter.",
  },
  {
    resolvePath: (config) => config.paths.subdirectories.agents,
    reason: "This path contains agent workspaces managed by CommandsCenter.",
  },
  {
    resolvePath: (config) => resolve(config.paths.subdirectories.agents, ".archived"),
    recursive: true,
    reason: "This path contains archived agent workspaces managed by CommandsCenter.",
  },
];

const CRITICAL_AGENT_PATH_RULES: CriticalAgentPathRule[] = [
  {
    relativePath: "AGENTS.md",
    reason: "AGENTS.md defines the agent instructions and is required for agent behavior.",
  },
  {
    relativePath: "opencode.jsonc",
    reason: "opencode.jsonc stores the agent workspace configuration and permissions.",
  },
  {
    relativePath: ".opencode",
    recursive: true,
    reason: "This path is part of the OpenCode workspace runtime data used by the agent.",
  },
];

export type FileManagerService = ReturnType<typeof createFileManagerService>;

export function createFileManagerService(options: { config: RuntimeConfig }) {
  return {
    async listDirectory(
      root: RootReference,
      query: Pick<FileManagerListQuery, "path">,
    ): Promise<FileManagerListResponse> {
      const currentPath = sanitizeRelativePath(query.path);
      const absolutePath = resolveEntryPath(root, currentPath);
      const entries = await readDirectory(absolutePath);

      const currentDetails = await readEntryDetails(absolutePath);

      return {
        root: root.kind,
        currentPath,
        absolutePath,
        sizeBytes: currentDetails.sizeBytes,
        lineCount: currentDetails.lineCount,
        nodes: await Promise.all(
          entries.map(async (entry) => {
            const entryAbsolutePath = resolve(absolutePath, entry.name);
            const entryPath = toRelativePath(root, entryAbsolutePath);
            const criticalReason = getCriticalReason(
              entryAbsolutePath,
              entry.isDirectory(),
              options.config,
            );
            const details = await readEntryDetails(entryAbsolutePath);

            return {
              name: entry.name,
              path: entryPath,
              absolutePath: entryAbsolutePath,
              type: entry.isDirectory() ? "directory" : "file",
              sizeBytes: details.sizeBytes,
              lineCount: details.lineCount,
              isCritical: criticalReason !== undefined,
              criticalReason,
            } satisfies FileManagerNode;
          }),
        ),
      };
    },

    async createEntry(root: RootReference, input: FileManagerCreateEntryInput): Promise<string> {
      const parentPath = sanitizeRelativePath(input.parentPath);
      const name = validateEntryName(input.name);
      const parentAbsolutePath = resolveEntryPath(root, parentPath);
      const targetPath = resolve(parentAbsolutePath, name);

      ensureDescendant(root, targetPath);
      await assertMissing(targetPath);

      if (input.type === "directory") {
        await mkdir(targetPath, { recursive: false });
      } else {
        await writeFile(targetPath, "", { flag: "wx" });
      }

      return toRelativePath(root, targetPath);
    },

    async renameEntry(root: RootReference, input: FileManagerRenameEntryInput): Promise<string> {
      const currentAbsolutePath = resolveEntryPath(root, input.path);
      const name = validateEntryName(input.name);
      const targetPath = resolve(dirname(currentAbsolutePath), name);
      const criticalReason = getCriticalReason(currentAbsolutePath, false, options.config);

      if (criticalReason) {
        throw new ForbiddenError(criticalReason);
      }

      ensureDescendant(root, targetPath);
      await assertPresent(currentAbsolutePath);
      await assertMissing(targetPath);
      await rename(currentAbsolutePath, targetPath);

      return toRelativePath(root, targetPath);
    },

    async deleteEntry(root: RootReference, input: FileManagerDeleteEntryQuery): Promise<void> {
      const absolutePath = resolveEntryPath(root, input.path);
      const criticalReason = getCriticalReason(absolutePath, true, options.config);

      if (criticalReason) {
        throw new ForbiddenError(criticalReason);
      }

      await assertPresent(absolutePath);
      await rm(absolutePath, { recursive: true, force: false });
    },

    async readFileContent(
      root: RootReference,
      path: string,
    ): Promise<FileManagerFileContentResponse> {
      const absolutePath = resolveEntryPath(root, path);
      const stats = await statOrNotFound(absolutePath);

      if (!stats.isFile()) {
        throw new BadRequestError("Selected entry is not a file.");
      }

      const buffer = await readFile(absolutePath);
      const sizeBytes = buffer.byteLength;
      const mtimeMs = stats.mtimeMs;
      const isWritable = root.kind !== "host-filesystem";
      const relativePath = toRelativePath(root, absolutePath);
      const name = basename(absolutePath);
      const mimeType = guessMimeType(name);
      const isPreviewableMedia =
        mimeType !== undefined && (mimeType.startsWith("image/") || mimeType.startsWith("video/"));

      if (sizeBytes > FILE_EDITOR_MAX_BYTES && !isPreviewableMedia) {
        return {
          root: root.kind,
          path: relativePath,
          absolutePath,
          name,
          kind: "too-large",
          content: "",
          mimeType,
          revision: { mtimeMs, sizeBytes, sha256: hashBuffer(buffer) },
          isWritable,
        };
      }

      const binary = isPreviewableMedia || isBinaryBuffer(buffer);

      if (binary) {
        return {
          root: root.kind,
          path: relativePath,
          absolutePath,
          name,
          kind: "binary",
          content: buffer.toString("base64"),
          encoding: "base64",
          mimeType,
          revision: { mtimeMs, sizeBytes, sha256: hashBuffer(buffer) },
          isWritable,
        };
      }

      return {
        root: root.kind,
        path: relativePath,
        absolutePath,
        name,
        kind: "text",
        content: buffer.toString("utf8"),
        mimeType,
        revision: { mtimeMs, sizeBytes, sha256: hashBuffer(buffer) },
        isWritable,
      };
    },

    async writeFileContent(
      root: RootReference,
      input: FileManagerSaveFileInput,
      writeOptions: { allowHostFilesystemEdits: boolean },
    ): Promise<FileManagerSaveFileResponse> {
      if (root.kind === "host-filesystem" && !writeOptions.allowHostFilesystemEdits) {
        throw new ForbiddenError(
          "Host filesystem edits are disabled. Enable them in Settings to save files outside the workspace.",
        );
      }

      const absolutePath = resolveEntryPath(root, input.path);
      const stats = await statOrNotFound(absolutePath);

      if (!stats.isFile()) {
        throw new BadRequestError("Selected entry is not a file.");
      }

      const expected = input.expectedRevision;
      const fastMatch =
        Math.trunc(stats.mtimeMs) === Math.trunc(expected.mtimeMs) &&
        stats.size === expected.sizeBytes;

      if (!fastMatch) {
        const currentBuffer = await readFile(absolutePath);
        const currentSha = hashBuffer(currentBuffer);

        if (!expected.sha256 || expected.sha256 !== currentSha) {
          throw new ConflictError(
            "The file changed on disk after it was opened. Reload to see the latest contents or overwrite to keep your changes.",
            {
              currentRevision: {
                mtimeMs: stats.mtimeMs,
                sizeBytes: stats.size,
                sha256: currentSha,
              } satisfies FileManagerFileRevision,
            },
          );
        }
      }

      const data =
        input.encoding === "base64" ? Buffer.from(input.content, "base64") : input.content;
      await writeFile(absolutePath, data);

      const updatedStats = await stat(absolutePath);
      const updatedBuffer = await readFile(absolutePath);

      return {
        path: toRelativePath(root, absolutePath),
        revision: {
          mtimeMs: updatedStats.mtimeMs,
          sizeBytes: updatedStats.size,
          sha256: hashBuffer(updatedBuffer),
        },
      };
    },

    async uploadEntries(
      root: RootReference,
      input: FileManagerUploadInput,
      uploadOptions: {
        allowHostFilesystemEdits: boolean;
        maxUploadSizeBytes: number;
        allowDangerousFiles: boolean;
      },
    ): Promise<FileManagerUploadResponse> {
      if (root.kind === "host-filesystem" && !uploadOptions.allowHostFilesystemEdits) {
        throw new ForbiddenError(
          "Host filesystem uploads are disabled. Enable host filesystem edits in Settings to upload outside the workspace.",
        );
      }

      const destinationPath = sanitizeRelativePath(input.destinationPath);
      const destinationAbsolutePath = resolveEntryPath(root, destinationPath);
      const destinationStats = await statOrNotFound(destinationAbsolutePath);

      if (!destinationStats.isDirectory()) {
        throw new BadRequestError("Upload destination must be a directory.");
      }

      const uploaded: FileManagerUploadResponse["uploaded"] = [];
      const rejected: FileManagerRejectedUploadEntry[] = [];

      for (const entry of input.entries) {
        const relativePath = sanitizeUploadRelativePath(entry.relativePath);
        const targetAbsolutePath = resolve(destinationAbsolutePath, relativePath);
        ensureDescendant(root, targetAbsolutePath);

        const rejection = await getUploadRejection({
          root,
          targetAbsolutePath,
          relativePath,
          entry,
          config: options.config,
          uploadOptions,
        });

        if (rejection) {
          rejected.push(rejection);
          continue;
        }

        const parentAbsolutePath = dirname(targetAbsolutePath);
        ensureDescendant(root, parentAbsolutePath);
        await mkdir(parentAbsolutePath, { recursive: true });
        await writeFile(targetAbsolutePath, Buffer.from(entry.contentBase64, "base64"), {
          flag: "wx",
        });

        uploaded.push({
          name: entry.name,
          relativePath,
          path: toRelativePath(root, targetAbsolutePath),
        });
      }

      return { uploaded, rejected };
    },
  };

  async function readDirectory(path: string) {
    try {
      const entries = await readdir(path, { withFileTypes: true });

      return entries
        .filter((entry) => entry.isDirectory() || entry.isFile())
        .sort((left, right) => {
          if (left.isDirectory() && !right.isDirectory()) {
            return -1;
          }

          if (!left.isDirectory() && right.isDirectory()) {
            return 1;
          }

          return left.name.localeCompare(right.name);
        });
    } catch (error) {
      if (isMissingError(error)) {
        throw new NotFoundError("Directory not found.");
      }

      throw error;
    }
  }
}

export function resolveFileManagerRoot(options: {
  kind: FileManagerRootKind;
  config: RuntimeConfig;
}): RootReference {
  if (options.kind === "workspace") {
    return {
      kind: options.kind,
      basePath: options.config.paths.workspaceDir,
    };
  }

  if (options.kind === "all-agents") {
    return {
      kind: options.kind,
      basePath: options.config.paths.subdirectories.agents,
    };
  }

  return {
    kind: options.kind,
    basePath: sep,
  };
}

function sanitizeRelativePath(path: string | undefined): string {
  if (!path || path.trim() === "") {
    return ".";
  }

  const trimmed = path.trim();

  if (trimmed === ".") {
    return ".";
  }

  return trimmed;
}

function sanitizeUploadRelativePath(path: string): string {
  const trimmed = path.trim();

  if (trimmed.length === 0 || trimmed === "." || trimmed === "..") {
    throw new BadRequestError("Upload path is invalid.");
  }

  const segments = trimmed.split(/[\\/]/).filter(Boolean);

  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new BadRequestError("Upload path escapes the selected root.");
  }

  return segments.join("/");
}

async function getUploadRejection(options: {
  root: RootReference;
  targetAbsolutePath: string;
  relativePath: string;
  entry: FileManagerUploadInput["entries"][number];
  config: RuntimeConfig;
  uploadOptions: {
    maxUploadSizeBytes: number;
    allowDangerousFiles: boolean;
  };
}): Promise<FileManagerRejectedUploadEntry | undefined> {
  const normalizedSizeLimit =
    options.uploadOptions.maxUploadSizeBytes > 0
      ? options.uploadOptions.maxUploadSizeBytes
      : DEFAULT_MAX_UPLOAD_SIZE_BYTES;

  if (options.entry.sizeBytes > normalizedSizeLimit) {
    return {
      name: options.entry.name,
      relativePath: options.relativePath,
      reason: `File exceeds the ${formatUploadSize(normalizedSizeLimit)} upload limit.`,
    };
  }

  const ext = extname(options.entry.name).toLowerCase();
  if (!options.uploadOptions.allowDangerousFiles && DANGEROUS_UPLOAD_EXTENSIONS.has(ext)) {
    return {
      name: options.entry.name,
      relativePath: options.relativePath,
      reason: "This file type is blocked by the current dangerous-file policy.",
    };
  }

  try {
    await access(options.targetAbsolutePath);
    return {
      name: options.entry.name,
      relativePath: options.relativePath,
      reason: getCriticalReason(options.targetAbsolutePath, false, options.config)
        ? "This upload would overwrite a protected CommandsCenter-managed file."
        : "An entry with this name already exists in the destination folder.",
    };
  } catch (error) {
    if (isMissingError(error)) {
      return undefined;
    }

    throw error;
  }
}

function validateEntryName(name: string): string {
  const trimmed = name.trim();

  if (trimmed.length === 0 || trimmed === "." || trimmed === "..") {
    throw new BadRequestError("Entry name is invalid.");
  }

  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new BadRequestError("Entry name cannot contain path separators.");
  }

  return trimmed;
}

function resolveEntryPath(root: RootReference, path: string): string {
  const target =
    root.kind === "host-filesystem" ? resolve(sep, path) : resolve(root.basePath, path);

  ensureDescendant(root, target);
  return target;
}

function ensureDescendant(root: RootReference, target: string): void {
  if (root.kind === "host-filesystem") {
    return;
  }

  const rel = relative(root.basePath, target);

  if (rel.startsWith("..") || rel === "..") {
    throw new BadRequestError("Path escapes the selected root.");
  }
}

function toRelativePath(root: RootReference, target: string): string {
  if (root.kind === "host-filesystem") {
    const rel = relative(sep, target);
    return rel === "" ? "." : rel;
  }

  const rel = relative(root.basePath, target);
  return rel === "" ? "." : rel;
}

async function assertMissing(path: string): Promise<void> {
  try {
    await access(path);
    throw new ConflictError("An entry with that name already exists.");
  } catch (error) {
    if (isMissingError(error)) {
      return;
    }

    throw error;
  }
}

async function assertPresent(path: string): Promise<void> {
  try {
    await access(path);
  } catch (error) {
    if (isMissingError(error)) {
      throw new NotFoundError("Entry not found.");
    }

    throw error;
  }
}

function getCriticalReason(
  path: string,
  isDirectory: boolean,
  config: RuntimeConfig,
): string | undefined {
  for (const rule of CRITICAL_WORKSPACE_PATH_RULES) {
    if (matchesCriticalPath(path, rule.resolvePath(config), rule.recursive ?? false)) {
      return rule.reason;
    }
  }

  const agentRootRelative = relative(config.paths.subdirectories.agents, path);
  if (
    agentRootRelative !== "" &&
    !agentRootRelative.startsWith("..") &&
    !agentRootRelative.startsWith(`.archived${sep}`) &&
    agentRootRelative !== ".archived"
  ) {
    const segments = agentRootRelative.split(sep).filter(Boolean);

    if (segments.length === 1 && isDirectory) {
      return "This folder is an agent workspace managed by CommandsCenter.";
    }

    if (segments.length >= 2) {
      const agentRelativePath = segments.slice(1).join(sep);

      for (const rule of CRITICAL_AGENT_PATH_RULES) {
        if (matchesCriticalPath(agentRelativePath, rule.relativePath, rule.recursive ?? false)) {
          return rule.reason;
        }
      }
    }
  }

  return undefined;
}

async function readEntryDetails(path: string): Promise<{
  sizeBytes?: number;
  lineCount?: number;
}> {
  const stats = await stat(path);

  if (stats.isDirectory()) {
    return {};
  }

  const sizeBytes = stats.size;

  if (sizeBytes > 1024 * 1024) {
    return { sizeBytes };
  }

  try {
    const content = await readFile(path, "utf8");

    if (content.includes("\u0000")) {
      return { sizeBytes };
    }

    return {
      sizeBytes,
      lineCount: content.length === 0 ? 0 : content.split(/\r?\n/).length,
    };
  } catch {
    return { sizeBytes };
  }
}

function matchesCriticalPath(path: string, basePath: string, recursive: boolean): boolean {
  if (path === basePath) {
    return true;
  }

  if (!recursive) {
    return false;
  }

  return path.startsWith(`${basePath}${sep}`);
}

function isMissingError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function statOrNotFound(path: string) {
  try {
    return await stat(path);
  } catch (error) {
    if (isMissingError(error)) {
      throw new NotFoundError("File not found.");
    }

    throw error;
  }
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.byteLength, 8 * 1024);
  for (let index = 0; index < sampleSize; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
  }
  return false;
}

const MIME_TYPES: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".json": "application/json",
  ".jsonc": "application/json",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".cjs": "text/javascript",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".jsx": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".htm": "text/html",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".yml": "application/yaml",
  ".yaml": "application/yaml",
  ".toml": "application/toml",
  ".sh": "text/x-shellscript",
  ".py": "text/x-python",
  ".rb": "text/x-ruby",
  ".go": "text/x-go",
  ".rs": "text/x-rust",
  ".java": "text/x-java",
  ".c": "text/x-c",
  ".h": "text/x-c",
  ".cpp": "text/x-c++",
  ".hpp": "text/x-c++",
  ".sql": "application/sql",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".ogg": "video/ogg",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

function guessMimeType(name: string): string | undefined {
  const ext = extname(name).toLowerCase();
  return MIME_TYPES[ext];
}

function formatUploadSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${Math.round(sizeBytes / (1024 * 1024))} MB`;
  }

  if (sizeBytes >= 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  return `${sizeBytes} B`;
}
