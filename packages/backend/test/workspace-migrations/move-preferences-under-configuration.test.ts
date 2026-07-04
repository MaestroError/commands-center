import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import { movePreferencesUnderConfigurationMigration } from "../../src/workspace-migrations/migrations/0008-move-preferences-under-configuration";
import { readWorkspaceMigrationState } from "../../src/workspace-migrations/state";
import {
  rollbackLatestWorkspaceMigration,
  runWorkspaceMigrations,
} from "../../src/workspace-migrations/service";

const APPLIED_AT = new Date("2026-07-04T00:00:00.000Z");

async function withConfig(
  fn: (config: ReturnType<typeof loadRuntimeConfig>) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "cc-preferences-migration-"));

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

function run(config: ReturnType<typeof loadRuntimeConfig>) {
  return runWorkspaceMigrations({
    config,
    logger: createLogger() as never,
    migrations: [movePreferencesUnderConfigurationMigration],
    now: () => APPLIED_AT,
  });
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

describe("movePreferencesUnderConfigurationMigration", () => {
  it("no-ops on a current workspace and records it", async () => {
    await withConfig(async (config) => {
      await mkdir(config.paths.subdirectories.preferences, { recursive: true });

      const result = await run(config);

      expect(result.applied.map((migration) => migration.id)).toEqual([
        "0008-move-preferences-under-configuration",
      ]);
      await expect(exists(config.paths.subdirectories.preferences)).resolves.toBe(true);
      expect((await readWorkspaceMigrationState(config)).applied).toEqual([
        {
          id: "0008-move-preferences-under-configuration",
          description:
            "Move workspace preferences under configuration/preferences and remove the unused empty mcp directory.",
          appliedAt: APPLIED_AT.toISOString(),
        },
      ]);
    });
  });

  it("moves legacy preferences and removes an empty mcp directory", async () => {
    await withConfig(async (config) => {
      await writeWorkspaceFile(config, "preferences/file-manager.json", '{"allow":true}');
      await mkdir(resolve(config.paths.workspaceDir, "mcp"), { recursive: true });

      await run(config);

      await expect(exists(resolve(config.paths.workspaceDir, "preferences"))).resolves.toBe(false);
      await expect(
        readFile(resolve(config.paths.subdirectories.preferences, "file-manager.json"), "utf8"),
      ).resolves.toBe('{"allow":true}');
      await expect(exists(resolve(config.paths.workspaceDir, "mcp"))).resolves.toBe(false);
    });
  });

  it("is a no-op when re-run after success", async () => {
    await withConfig(async (config) => {
      await writeWorkspaceFile(config, "preferences/file-manager.json", "{}");
      await run(config);

      const second = await run(config);

      expect(second.applied).toEqual([]);
      await expect(
        readFile(resolve(config.paths.subdirectories.preferences, "file-manager.json"), "utf8"),
      ).resolves.toBe("{}");
    });
  });

  it("fails when legacy and new preference directories both exist", async () => {
    await withConfig(async (config) => {
      await writeWorkspaceFile(config, "preferences/file-manager.json", "{}");
      await writeWorkspaceFile(config, "configuration/preferences/session-archive.json", "{}");

      await expect(run(config)).rejects.toThrow("both preferences/ and configuration/preferences/");
      expect((await readWorkspaceMigrationState(config)).applied).toEqual([]);
      await expect(
        readFile(resolve(config.paths.workspaceDir, "preferences/file-manager.json"), "utf8"),
      ).resolves.toBe("{}");
      await expect(
        readFile(resolve(config.paths.subdirectories.preferences, "session-archive.json"), "utf8"),
      ).resolves.toBe("{}");
    });
  });

  it("fails when mcp contains unexpected content", async () => {
    await withConfig(async (config) => {
      await writeWorkspaceFile(config, "mcp/notes.md", "keep");

      await expect(run(config)).rejects.toThrow("mcp directory because it is not empty");
      expect((await readWorkspaceMigrationState(config)).applied).toEqual([]);
      await expect(
        readFile(resolve(config.paths.workspaceDir, "mcp/notes.md"), "utf8"),
      ).resolves.toBe("keep");
    });
  });

  it("rolls back the preferences move and recreates mcp", async () => {
    await withConfig(async (config) => {
      await writeWorkspaceFile(config, "preferences/file-manager.json", "{}");
      await mkdir(resolve(config.paths.workspaceDir, "mcp"), { recursive: true });
      await run(config);

      const result = await rollbackLatestWorkspaceMigration({
        config,
        logger: createLogger() as never,
        migrations: [movePreferencesUnderConfigurationMigration],
      });

      expect(result.rolledBack?.id).toBe("0008-move-preferences-under-configuration");
      await expect(
        readFile(resolve(config.paths.workspaceDir, "preferences/file-manager.json"), "utf8"),
      ).resolves.toBe("{}");
      await expect(exists(config.paths.subdirectories.preferences)).resolves.toBe(false);
      await expect(exists(resolve(config.paths.workspaceDir, "mcp"))).resolves.toBe(true);
    });
  });

  it("refuses rollback when legacy preferences already exist", async () => {
    await withConfig(async (config) => {
      await writeWorkspaceFile(config, "preferences/file-manager.json", "{}");
      await run(config);
      await writeWorkspaceFile(config, "preferences/session-archive.json", "{}");

      await expect(
        rollbackLatestWorkspaceMigration({
          config,
          logger: createLogger() as never,
          migrations: [movePreferencesUnderConfigurationMigration],
        }),
      ).rejects.toThrow("Cannot roll back workspace preferences move");
      expect((await readWorkspaceMigrationState(config)).applied.map((item) => item.id)).toEqual([
        "0008-move-preferences-under-configuration",
      ]);
      await expect(
        readFile(resolve(config.paths.subdirectories.preferences, "file-manager.json"), "utf8"),
      ).resolves.toBe("{}");
    });
  });
});
