import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import { renameAgentsToSpecialistsMigration } from "../../src/workspace-migrations/migrations/0002-rename-agents-to-specialists";
import { readWorkspaceMigrationState } from "../../src/workspace-migrations/state";
import {
  rollbackLatestWorkspaceMigration,
  runWorkspaceMigrations,
} from "../../src/workspace-migrations/service";

const APPLIED_AT = new Date("2026-06-14T00:00:00.000Z");

async function withConfig(
  fn: (config: ReturnType<typeof loadRuntimeConfig>) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "cc-specialist-rename-migration-"));

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

async function expectMissing(path: string): Promise<void> {
  await expect(stat(path)).rejects.toThrow();
}

describe("renameAgentsToSpecialistsMigration", () => {
  it("renames active and archived agent workspaces to specialists", async () => {
    await withConfig(async (config) => {
      const logger = createLogger();
      await writeWorkspaceFile(config, "agents/writer/agent.json", '{"name":"Writer"}');
      await writeWorkspaceFile(config, "agents/writer/AGENTS.md", "# Writer");
      await writeWorkspaceFile(config, "agents/.archived/reviewer/agent.json", '{"name":"Review"}');
      await writeWorkspaceFile(config, "agents/.archived/reviewer/AGENTS.md", "# Reviewer");

      const result = await runWorkspaceMigrations({
        config,
        logger: logger as never,
        migrations: [renameAgentsToSpecialistsMigration],
        now: () => APPLIED_AT,
      });

      expect(result.applied.map((migration) => migration.id)).toEqual([
        "0002-rename-agents-to-specialists",
      ]);
      await expect(
        readFile(resolve(config.paths.workspaceDir, "specialists/writer/specialist.json"), "utf8"),
      ).resolves.toBe('{"name":"Writer"}');
      await expect(
        readFile(resolve(config.paths.workspaceDir, "specialists/writer/AGENTS.md"), "utf8"),
      ).resolves.toBe("# Writer");
      await expect(
        readFile(
          resolve(config.paths.workspaceDir, "specialists/.archived/reviewer/specialist.json"),
          "utf8",
        ),
      ).resolves.toBe('{"name":"Review"}');
      await expectMissing(resolve(config.paths.workspaceDir, "agents"));
      await expectMissing(resolve(config.paths.workspaceDir, "specialists/writer/agent.json"));
      expect((await readWorkspaceMigrationState(config)).applied).toEqual([
        {
          id: "0002-rename-agents-to-specialists",
          description: "Rename CC agent workspace files to specialist workspace files.",
          appliedAt: APPLIED_AT.toISOString(),
        },
      ]);
    });
  });

  it("renames leftover agent metadata when the root was already moved", async () => {
    await withConfig(async (config) => {
      const logger = createLogger();
      await writeWorkspaceFile(config, "specialists/writer/agent.json", '{"name":"Writer"}');

      await runWorkspaceMigrations({
        config,
        logger: logger as never,
        migrations: [renameAgentsToSpecialistsMigration],
        now: () => APPLIED_AT,
      });

      await expect(
        readFile(resolve(config.paths.workspaceDir, "specialists/writer/specialist.json"), "utf8"),
      ).resolves.toBe('{"name":"Writer"}');
      await expectMissing(resolve(config.paths.workspaceDir, "specialists/writer/agent.json"));
    });
  });

  it("records an already migrated workspace as applied", async () => {
    await withConfig(async (config) => {
      const logger = createLogger();
      await writeWorkspaceFile(config, "specialists/writer/specialist.json", '{"name":"Writer"}');

      const result = await runWorkspaceMigrations({
        config,
        logger: logger as never,
        migrations: [renameAgentsToSpecialistsMigration],
        now: () => APPLIED_AT,
      });

      expect(result.applied.map((migration) => migration.id)).toEqual([
        "0002-rename-agents-to-specialists",
      ]);
      await expect(
        readFile(resolve(config.paths.workspaceDir, "specialists/writer/specialist.json"), "utf8"),
      ).resolves.toBe('{"name":"Writer"}');
    });
  });

  it("fails when old and new workspace roots both exist", async () => {
    await withConfig(async (config) => {
      const logger = createLogger();
      await writeWorkspaceFile(config, "agents/writer/agent.json", '{"name":"Writer"}');
      await writeWorkspaceFile(config, "specialists/reviewer/specialist.json", '{"name":"Review"}');

      await expect(
        runWorkspaceMigrations({
          config,
          logger: logger as never,
          migrations: [renameAgentsToSpecialistsMigration],
          now: () => APPLIED_AT,
        }),
      ).rejects.toThrow("both directories exist");
      await expect(readWorkspaceMigrationState(config)).resolves.toEqual({
        version: 1,
        applied: [],
      });
    });
  });

  it("fails when old and new metadata files both exist", async () => {
    await withConfig(async (config) => {
      const logger = createLogger();
      await writeWorkspaceFile(config, "specialists/writer/agent.json", '{"name":"Old"}');
      await writeWorkspaceFile(config, "specialists/writer/specialist.json", '{"name":"New"}');

      await expect(
        runWorkspaceMigrations({
          config,
          logger: logger as never,
          migrations: [renameAgentsToSpecialistsMigration],
          now: () => APPLIED_AT,
        }),
      ).rejects.toThrow("both files exist");
      await expect(readWorkspaceMigrationState(config)).resolves.toEqual({
        version: 1,
        applied: [],
      });
    });
  });

  it("rolls back specialist workspaces to agents", async () => {
    await withConfig(async (config) => {
      const logger = createLogger();
      await writeWorkspaceFile(config, "agents/writer/agent.json", '{"name":"Writer"}');
      await writeWorkspaceFile(config, "agents/writer/AGENTS.md", "# Writer");

      await runWorkspaceMigrations({
        config,
        logger: logger as never,
        migrations: [renameAgentsToSpecialistsMigration],
        now: () => APPLIED_AT,
      });

      const result = await rollbackLatestWorkspaceMigration({
        config,
        logger: logger as never,
        migrations: [renameAgentsToSpecialistsMigration],
      });

      expect(result.rolledBack?.id).toBe("0002-rename-agents-to-specialists");
      await expect(
        readFile(resolve(config.paths.workspaceDir, "agents/writer/agent.json"), "utf8"),
      ).resolves.toBe('{"name":"Writer"}');
      await expect(
        readFile(resolve(config.paths.workspaceDir, "agents/writer/AGENTS.md"), "utf8"),
      ).resolves.toBe("# Writer");
      await expectMissing(resolve(config.paths.workspaceDir, "specialists"));
      await expect(readWorkspaceMigrationState(config)).resolves.toEqual({
        version: 1,
        applied: [],
      });
    });
  });

  it("leaves state unchanged when rollback hits a root conflict", async () => {
    await withConfig(async (config) => {
      const logger = createLogger();
      await writeWorkspaceFile(config, "agents/writer/agent.json", '{"name":"Writer"}');

      await runWorkspaceMigrations({
        config,
        logger: logger as never,
        migrations: [renameAgentsToSpecialistsMigration],
        now: () => APPLIED_AT,
      });
      await writeWorkspaceFile(config, "agents/conflict/agent.json", '{"name":"Conflict"}');

      await expect(
        rollbackLatestWorkspaceMigration({
          config,
          logger: logger as never,
          migrations: [renameAgentsToSpecialistsMigration],
        }),
      ).rejects.toThrow("both directories exist");
      expect((await readWorkspaceMigrationState(config)).applied.map((item) => item.id)).toEqual([
        "0002-rename-agents-to-specialists",
      ]);
    });
  });
});
