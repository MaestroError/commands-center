import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";

import {
  taskRegisteredArtifactSchema,
  type TaskRegisteredArtifact,
  type TaskRun,
  type TaskRunArtifact,
} from "@cc/shared/schemas";
import { z } from "zod";

import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import { writeConfigFileAtomic } from "../lib/config-file.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { TaskService } from "./task-service.js";

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

const taskArtifactManifestSchema = z.object({
  version: z.literal(1),
  artifacts: z.array(taskRegisteredArtifactSchema.omit({ shareLinks: true })),
});

type ArtifactCandidate = {
  id: string;
  artifact: TaskRunArtifact;
};

export type TaskArtifactService = ReturnType<typeof createTaskArtifactService>;

export function createTaskArtifactService(options: {
  config: RuntimeConfig;
  taskService: TaskService;
}) {
  return {
    async listRunArtifacts(taskId: string, runId: string): Promise<TaskRegisteredArtifact[]> {
      const run = await requireRun(options.taskService, taskId, runId);
      const manifest = await readManifest(options.config);

      const artifacts = await Promise.all(
        listLocalCandidates(run).map(async (candidate) => {
          const stored = manifest.artifacts.find((entry) => entry.id === candidate.id);

          if (stored) {
            return taskRegisteredArtifactSchema.parse({ ...stored, shareLinks: [] });
          }

          const filename = validateFilename(candidate.artifact.path);
          const sourcePath = resolveWorkspaceSourcePath(options.config, candidate.artifact.path);
          const sourceStat = await stat(sourcePath).catch((error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
              return undefined;
            }

            throw error;
          });

          if (!sourceStat?.isFile()) {
            return undefined;
          }

          const content = await readFile(sourcePath);

          return taskRegisteredArtifactSchema.parse({
            id: candidate.id,
            taskId,
            runId,
            title: candidate.artifact.title,
            description: candidate.artifact.description,
            originalFilename: filename,
            mimeType: resolveMimeType(filename),
            sizeBytes: sourceStat.size,
            checksum: createHash("sha256").update(content).digest("hex"),
            storageKey: null,
            createdAt: run.createdAt,
            shareLinks: [],
          });
        }),
      );

      return artifacts.filter(
        (artifact): artifact is TaskRegisteredArtifact => artifact !== undefined,
      );
    },

    async publishRunArtifact(
      taskId: string,
      runId: string,
      artifactId: string,
    ): Promise<TaskRegisteredArtifact> {
      const run = await requireRun(options.taskService, taskId, runId);
      const candidate = listLocalCandidates(run).find((entry) => entry.id === artifactId);

      if (!candidate) {
        throw new NotFoundError("Task artifact not found.");
      }

      const manifest = await readManifest(options.config);
      const existing = manifest.artifacts.find((entry) => entry.id === artifactId);

      if (existing) {
        return taskRegisteredArtifactSchema.parse({ ...existing, shareLinks: [] });
      }

      const filename = validateFilename(candidate.artifact.path);
      const mimeType = resolveMimeType(filename);
      const sourcePath = resolveWorkspaceSourcePath(options.config, candidate.artifact.path);
      const sourceStat = await stat(sourcePath).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new NotFoundError("Task artifact source file not found.");
        }

        throw error;
      });

      if (!sourceStat.isFile()) {
        throw new BadRequestError("Task artifact source must be a file.");
      }

      const content = await readFile(sourcePath);
      const checksum = createHash("sha256").update(content).digest("hex");
      const storageKey = `specialists/${run.agentId}/tasks/${taskId}/runs/${runId}/published-artifacts/${artifactId}/${filename}`;
      const destinationPath = resolveArtifactStoragePath(options.config, storageKey);

      await mkdir(dirname(destinationPath), { recursive: true });
      await copyFile(sourcePath, destinationPath);

      const stored = taskRegisteredArtifactSchema.omit({ shareLinks: true }).parse({
        id: artifactId,
        taskId,
        runId,
        title: candidate.artifact.title,
        description: candidate.artifact.description,
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

      return taskRegisteredArtifactSchema.parse({ ...stored, shareLinks: [] });
    },

    async getRegisteredArtifact(artifactId: string): Promise<TaskRegisteredArtifact | undefined> {
      const manifest = await readManifest(options.config);
      const stored = manifest.artifacts.find((entry) => entry.id === artifactId);
      return stored ? taskRegisteredArtifactSchema.parse({ ...stored, shareLinks: [] }) : undefined;
    },

    resolveArtifactPath(storageKey: string): string {
      return resolveArtifactStoragePath(options.config, storageKey);
    },
  };
}

function listLocalCandidates(run: TaskRun): ArtifactCandidate[] {
  return run.artifacts
    .map((artifact, index) => ({ id: createArtifactCandidateId(run, artifact, index), artifact }))
    .filter((candidate) => candidate.artifact.path !== undefined);
}

function createArtifactCandidateId(run: TaskRun, artifact: TaskRunArtifact, index: number): string {
  return createHash("sha256")
    .update([run.taskId, run.id, String(index), artifact.title, artifact.path ?? ""].join("\0"))
    .digest("hex")
    .slice(0, 26);
}

async function requireRun(
  taskService: TaskService,
  taskId: string,
  runId: string,
): Promise<TaskRun> {
  const run = await taskService.getRun(taskId, runId);

  if (!run) {
    throw new NotFoundError("Task run not found.");
  }

  return run;
}

function manifestPath(config: RuntimeConfig): string {
  return resolve(config.paths.subdirectories.sessions, ARTIFACT_MANIFEST_FILE);
}

async function readManifest(
  config: RuntimeConfig,
): Promise<z.infer<typeof taskArtifactManifestSchema>> {
  const path = manifestPath(config);

  try {
    const raw = await readFile(path, "utf8");
    return taskArtifactManifestSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, artifacts: [] };
    }

    throw error;
  }
}

async function writeManifest(
  config: RuntimeConfig,
  manifest: z.infer<typeof taskArtifactManifestSchema>,
): Promise<void> {
  await writeConfigFileAtomic(manifestPath(config), taskArtifactManifestSchema.parse(manifest));
}

function validateFilename(path: string | undefined): string {
  if (!path) {
    throw new BadRequestError("Task artifact path is missing.");
  }

  const filename = basename(path.trim());

  if (filename.length === 0 || filename === "." || filename === "..") {
    throw new BadRequestError("Task artifact filename is invalid.");
  }

  return filename;
}

function resolveMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase() as keyof typeof ARTIFACT_MIME_TYPES;
  return ARTIFACT_MIME_TYPES[ext] ?? "application/octet-stream";
}

function resolveWorkspaceSourcePath(config: RuntimeConfig, path: string | undefined): string {
  if (!path) {
    throw new BadRequestError("Task artifact path is missing.");
  }

  const trimmed = path.trim();

  if (trimmed.length === 0 || trimmed.startsWith("/") || trimmed === "." || trimmed === "..") {
    throw new BadRequestError("Task artifact path is invalid.");
  }

  const sourcePath = resolve(config.paths.workspaceDir, trimmed);
  ensureDescendant(
    sourcePath,
    config.paths.workspaceDir,
    "Task artifact path must stay in workspace.",
  );
  return sourcePath;
}

function resolveArtifactStoragePath(config: RuntimeConfig, storageKey: string): string {
  const parts = storageKey.split("/");

  if (
    parts.length !== 9 ||
    parts[0] !== "specialists" ||
    parts[2] !== "tasks" ||
    parts[4] !== "runs" ||
    parts[6] !== "published-artifacts" ||
    parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new BadRequestError("Task artifact storage key is invalid.");
  }

  const path = resolve(config.paths.subdirectories.sessions, ...parts);
  ensureDescendant(
    path,
    config.paths.subdirectories.sessions,
    "Task artifact storage key is invalid.",
  );
  return path;
}

function ensureDescendant(candidatePath: string, rootPath: string, message: string): void {
  const rel = relative(rootPath, candidatePath);

  if (rel === "" || rel.startsWith("..") || rel.startsWith(sep)) {
    throw new BadRequestError(message);
  }
}
