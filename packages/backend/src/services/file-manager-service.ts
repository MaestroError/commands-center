import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import type { RuntimeConfig } from "../lib/runtime-config.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/api-error.js";
import type {
  FileManagerCreateEntryInput,
  FileManagerDeleteEntryQuery,
  FileManagerListQuery,
  FileManagerListResponse,
  FileManagerNode,
  FileManagerRenameEntryInput,
  FileManagerRootKind,
} from "@cc/shared/schemas";

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

      ensureDescendant(root, targetPath);
      await assertPresent(currentAbsolutePath);
      await assertMissing(targetPath);
      await rename(currentAbsolutePath, targetPath);

      return toRelativePath(root, targetPath);
    },

    async deleteEntry(root: RootReference, input: FileManagerDeleteEntryQuery): Promise<void> {
      const absolutePath = resolveEntryPath(root, input.path);
      await assertPresent(absolutePath);
      await rm(absolutePath, { recursive: true, force: false });
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
