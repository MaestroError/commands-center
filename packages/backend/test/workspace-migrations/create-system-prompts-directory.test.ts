import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import { createSystemPromptsDirectoryMigration } from "../../src/workspace-migrations/migrations/0004-create-system-prompts-directory";
import { readWorkspaceMigrationState } from "../../src/workspace-migrations/state";
import {
  rollbackLatestWorkspaceMigration,
  runWorkspaceMigrations,
} from "../../src/workspace-migrations/service";

const APPLIED_AT = new Date("2026-06-23T00:00:00.000Z");
const DIR = "configuration/system-prompts";

async function withConfig(
  fn: (config: ReturnType<typeof loadRuntimeConfig>) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "cc-system-prompts-migration-"));
  try {
    await fn(loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } }));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
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
    migrations: [createSystemPromptsDirectoryMigration],
    now: () => APPLIED_AT,
  });
}

describe("createSystemPromptsDirectoryMigration", () => {
  it("creates the directory on a fresh workspace and records it", async () => {
    await withConfig(async (config) => {
      const result = await run(config);

      expect(result.applied.map((migration) => migration.id)).toEqual([
        "0004-create-system-prompts-directory",
      ]);
      await expect(exists(resolve(config.paths.workspaceDir, DIR))).resolves.toBe(true);
      expect((await readWorkspaceMigrationState(config)).applied.map((item) => item.id)).toEqual([
        "0004-create-system-prompts-directory",
      ]);
    });
  });

  it("does not seed any default prompt files", async () => {
    await withConfig(async (config) => {
      await run(config);
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(resolve(config.paths.workspaceDir, DIR));
      expect(entries).toEqual([]);
    });
  });

  it("is a no-op when the directory already exists", async () => {
    await withConfig(async (config) => {
      await mkdir(resolve(config.paths.workspaceDir, DIR), { recursive: true });
      const result = await run(config);
      expect(result.applied.map((migration) => migration.id)).toEqual([
        "0004-create-system-prompts-directory",
      ]);
      await expect(exists(resolve(config.paths.workspaceDir, DIR))).resolves.toBe(true);
    });
  });

  it("is a no-op when re-run after success", async () => {
    await withConfig(async (config) => {
      await run(config);
      const second = await run(config);
      expect(second.applied).toEqual([]);
    });
  });

  it("rolls back when the directory is empty", async () => {
    await withConfig(async (config) => {
      await run(config);
      const result = await rollbackLatestWorkspaceMigration({
        config,
        logger: createLogger() as never,
        migrations: [createSystemPromptsDirectoryMigration],
      });

      expect(result.rolledBack?.id).toBe("0004-create-system-prompts-directory");
      await expect(exists(resolve(config.paths.workspaceDir, DIR))).resolves.toBe(false);
      await expect(readWorkspaceMigrationState(config)).resolves.toEqual({
        version: 1,
        applied: [],
      });
    });
  });

  it("rolls back as a no-op when the directory was already removed", async () => {
    await withConfig(async (config) => {
      await run(config);
      // Simulate the directory being deleted out from under us before rollback.
      await rm(resolve(config.paths.workspaceDir, DIR), { recursive: true, force: true });

      const result = await rollbackLatestWorkspaceMigration({
        config,
        logger: createLogger() as never,
        migrations: [createSystemPromptsDirectoryMigration],
      });

      expect(result.rolledBack?.id).toBe("0004-create-system-prompts-directory");
      await expect(readWorkspaceMigrationState(config)).resolves.toEqual({
        version: 1,
        applied: [],
      });
    });
  });

  it("refuses to roll back when user prompt files exist and leaves state unchanged", async () => {
    await withConfig(async (config) => {
      await run(config);
      const filePath = resolve(config.paths.workspaceDir, DIR, "identity.md");
      await mkdir(resolve(filePath, ".."), { recursive: true });
      await writeFile(filePath, "custom", "utf8");

      await expect(
        rollbackLatestWorkspaceMigration({
          config,
          logger: createLogger() as never,
          migrations: [createSystemPromptsDirectoryMigration],
        }),
      ).rejects.toThrow("identity.md");

      expect((await readWorkspaceMigrationState(config)).applied.map((item) => item.id)).toEqual([
        "0004-create-system-prompts-directory",
      ]);
      await expect(exists(filePath)).resolves.toBe(true);
    });
  });
});
