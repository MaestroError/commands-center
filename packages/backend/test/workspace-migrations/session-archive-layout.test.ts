import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import { sessionArchiveLayoutMigration } from "../../src/workspace-migrations/migrations/0003-session-archive-layout";
import { readWorkspaceMigrationState } from "../../src/workspace-migrations/state";
import {
  rollbackLatestWorkspaceMigration,
  runWorkspaceMigrations,
} from "../../src/workspace-migrations/service";

const APPLIED_AT = new Date("2026-06-18T00:00:00.000Z");

async function withConfig(
  fn: (config: ReturnType<typeof loadRuntimeConfig>) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "cc-session-archive-migration-"));

  try {
    await fn(loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } }));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

async function writeWorkspaceFile(
  config: ReturnType<typeof loadRuntimeConfig>,
  path: string,
  content: string,
): Promise<void> {
  const absolutePath = resolve(config.paths.workspaceDir, path);
  await mkdir(resolve(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function run(config: ReturnType<typeof loadRuntimeConfig>) {
  return runWorkspaceMigrations({
    config,
    logger: createLogger() as never,
    migrations: [sessionArchiveLayoutMigration],
    now: () => APPLIED_AT,
  });
}

describe("sessionArchiveLayoutMigration", () => {
  it("creates the session archive layout on a fresh workspace and records it", async () => {
    await withConfig(async (config) => {
      const result = await run(config);

      expect(result.applied.map((migration) => migration.id)).toEqual([
        "0003-session-archive-layout",
      ]);
      await expect(
        exists(resolve(config.paths.workspaceDir, "sessions/specialists")),
      ).resolves.toBe(true);
      expect((await readWorkspaceMigrationState(config)).applied).toEqual([
        {
          id: "0003-session-archive-layout",
          description:
            "Create the session archive workspace layout and delete legacy task attachment and artifact directories.",
          appliedAt: APPLIED_AT.toISOString(),
        },
      ]);
    });
  });

  it("deletes the legacy task-context-attachments directory", async () => {
    await withConfig(async (config) => {
      await writeWorkspaceFile(config, "task-context-attachments/some-task/file.txt", "data");

      await run(config);

      await expect(
        exists(resolve(config.paths.workspaceDir, "task-context-attachments")),
      ).resolves.toBe(false);
      await expect(
        exists(resolve(config.paths.workspaceDir, "sessions/specialists")),
      ).resolves.toBe(true);
    });
  });

  it("deletes the legacy task-artifacts directory", async () => {
    await withConfig(async (config) => {
      await writeWorkspaceFile(config, "task-artifacts/artifacts.json", "{}");

      await run(config);

      await expect(exists(resolve(config.paths.workspaceDir, "task-artifacts"))).resolves.toBe(
        false,
      );
    });
  });

  it("is a no-op when re-run after success", async () => {
    await withConfig(async (config) => {
      await run(config);
      const second = await run(config);

      expect(second.applied).toEqual([]);
      await expect(
        exists(resolve(config.paths.workspaceDir, "sessions/specialists")),
      ).resolves.toBe(true);
    });
  });

  it("rolls back empty session roots", async () => {
    await withConfig(async (config) => {
      await run(config);

      const result = await rollbackLatestWorkspaceMigration({
        config,
        logger: createLogger() as never,
        migrations: [sessionArchiveLayoutMigration],
      });

      expect(result.rolledBack?.id).toBe("0003-session-archive-layout");
      await expect(exists(resolve(config.paths.workspaceDir, "sessions"))).resolves.toBe(false);
      await expect(readWorkspaceMigrationState(config)).resolves.toEqual({
        version: 1,
        applied: [],
      });
    });
  });

  it("refuses to roll back when session archive data exists and leaves state unchanged", async () => {
    await withConfig(async (config) => {
      await run(config);
      await writeWorkspaceFile(
        config,
        "sessions/specialists/agent-1/tasks/task-1/metadata.json",
        "{}",
      );

      await expect(
        rollbackLatestWorkspaceMigration({
          config,
          logger: createLogger() as never,
          migrations: [sessionArchiveLayoutMigration],
        }),
      ).rejects.toThrow("not empty");
      expect((await readWorkspaceMigrationState(config)).applied.map((item) => item.id)).toEqual([
        "0003-session-archive-layout",
      ]);
      await expect(
        exists(resolve(config.paths.workspaceDir, "sessions/specialists")),
      ).resolves.toBe(true);
    });
  });

  it("refuses to roll back when sessions/ has non-specialists content and makes no partial deletions", async () => {
    await withConfig(async (config) => {
      await run(config);
      // Simulate a published-artifacts manifest written by the artifact service after migration.
      await writeWorkspaceFile(config, "sessions/published-artifacts.json", "{}");

      await expect(
        rollbackLatestWorkspaceMigration({
          config,
          logger: createLogger() as never,
          migrations: [sessionArchiveLayoutMigration],
        }),
      ).rejects.toThrow("published-artifacts.json");
      // sessions/specialists/ must still exist — no partial deletion occurred.
      await expect(
        exists(resolve(config.paths.workspaceDir, "sessions/specialists")),
      ).resolves.toBe(true);
    });
  });
});
