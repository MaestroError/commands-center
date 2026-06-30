import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import {
  DOCUMENTS_AGENTS_GUIDE,
  createDocumentsAgentsGuideMigration,
} from "../../src/workspace-migrations/migrations/0005-create-documents-agents-guide";
import { readWorkspaceMigrationState } from "../../src/workspace-migrations/state";
import {
  rollbackLatestWorkspaceMigration,
  runWorkspaceMigrations,
} from "../../src/workspace-migrations/service";

const APPLIED_AT = new Date("2026-06-29T00:00:00.000Z");
const GUIDE = "Documents/AGENTS.md";

async function withConfig(
  fn: (config: ReturnType<typeof loadRuntimeConfig>) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "cc-documents-guide-migration-"));
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
    migrations: [createDocumentsAgentsGuideMigration],
    now: () => APPLIED_AT,
  });
}

describe("createDocumentsAgentsGuideMigration", () => {
  it("creates Documents/ and seeds AGENTS.md on a fresh workspace", async () => {
    await withConfig(async (config) => {
      const result = await run(config);

      expect(result.applied.map((migration) => migration.id)).toEqual([
        "0005-create-documents-agents-guide",
      ]);
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await expect(exists(guidePath)).resolves.toBe(true);
      expect(await readFile(guidePath, "utf8")).toBe(DOCUMENTS_AGENTS_GUIDE);
      expect((await readWorkspaceMigrationState(config)).applied.map((item) => item.id)).toEqual([
        "0005-create-documents-agents-guide",
      ]);
    });
  });

  it("does not overwrite an existing AGENTS.md", async () => {
    await withConfig(async (config) => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(resolve(config.paths.workspaceDir, "Documents"), { recursive: true });
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await writeFile(guidePath, "# Custom guide\n", "utf8");

      await run(config);

      expect(await readFile(guidePath, "utf8")).toBe("# Custom guide\n");
    });
  });

  it("is a no-op when re-run after success", async () => {
    await withConfig(async (config) => {
      await run(config);
      const second = await run(config);
      expect(second.applied).toEqual([]);
    });
  });

  it("rolls back by removing the seeded guide", async () => {
    await withConfig(async (config) => {
      await run(config);
      const result = await rollbackLatestWorkspaceMigration({
        config,
        logger: createLogger() as never,
        migrations: [createDocumentsAgentsGuideMigration],
      });

      expect(result.rolledBack?.id).toBe("0005-create-documents-agents-guide");
      await expect(exists(resolve(config.paths.workspaceDir, GUIDE))).resolves.toBe(false);
      await expect(readWorkspaceMigrationState(config)).resolves.toEqual({
        version: 1,
        applied: [],
      });
    });
  });

  it("refuses to roll back when the guide was edited and leaves state unchanged", async () => {
    await withConfig(async (config) => {
      await run(config);
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await writeFile(guidePath, "# Edited by user\n", "utf8");

      await expect(
        rollbackLatestWorkspaceMigration({
          config,
          logger: createLogger() as never,
          migrations: [createDocumentsAgentsGuideMigration],
        }),
      ).rejects.toThrow("AGENTS.md");

      expect((await readWorkspaceMigrationState(config)).applied.map((item) => item.id)).toEqual([
        "0005-create-documents-agents-guide",
      ]);
      await expect(exists(guidePath)).resolves.toBe(true);
    });
  });
});
