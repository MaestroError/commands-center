import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import {
  findLatestAppliedWorkspaceMigration,
  listPendingWorkspaceMigrations,
  validateWorkspaceMigrationRegistry,
} from "../../src/workspace-migrations/registry";
import { readWorkspaceMigrationState } from "../../src/workspace-migrations/state";
import {
  rollbackLatestWorkspaceMigration,
  runWorkspaceMigrations,
} from "../../src/workspace-migrations/service";
import type { WorkspaceMigration } from "../../src/workspace-migrations/types";

const APPLIED_AT = new Date("2026-06-14T00:00:00.000Z");

async function withConfig(
  fn: (config: ReturnType<typeof loadRuntimeConfig>) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "cc-workspace-migrations-"));

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

function markerMigration(id: string, filename: string): WorkspaceMigration {
  return {
    id,
    description: `Migration ${id}`,
    async up({ config }) {
      await mkdir(config.paths.workspaceDir, { recursive: true });
      await writeFile(resolve(config.paths.workspaceDir, filename), "up", "utf8");
    },
    async down({ config }) {
      await rm(resolve(config.paths.workspaceDir, filename), { force: true });
    },
  };
}

describe("workspace migration registry", () => {
  it("rejects duplicate migration ids", () => {
    const migrations = [markerMigration("0001-a", "a"), markerMigration("0001-a", "b")];

    expect(() => validateWorkspaceMigrationRegistry(migrations)).toThrow(
      "Duplicate workspace migration id",
    );
  });

  it("rejects out-of-order migration ids", () => {
    const migrations = [markerMigration("0002-b", "b"), markerMigration("0001-a", "a")];

    expect(() => validateWorkspaceMigrationRegistry(migrations)).toThrow(
      "Workspace migrations must be sorted by id",
    );
  });

  it("lists pending migrations after applied migrations", () => {
    const migrations = [markerMigration("0001-a", "a"), markerMigration("0002-b", "b")];

    expect(
      listPendingWorkspaceMigrations({
        applied: [
          {
            id: "0001-a",
            description: "Migration 0001-a",
            appliedAt: APPLIED_AT.toISOString(),
          },
        ],
        migrations,
      }).map((migration) => migration.id),
    ).toEqual(["0002-b"]);
  });

  it("rejects unknown applied migration ids", () => {
    const migrations = [markerMigration("0001-a", "a")];

    expect(() =>
      findLatestAppliedWorkspaceMigration({
        applied: [
          {
            id: "0002-unknown",
            description: "Unknown",
            appliedAt: APPLIED_AT.toISOString(),
          },
        ],
        migrations,
      }),
    ).toThrow("is recorded as applied but is not known to this build");
  });

  it("rejects out-of-order applied migration ids", () => {
    const migrations = [markerMigration("0001-a", "a"), markerMigration("0002-b", "b")];

    expect(() =>
      listPendingWorkspaceMigrations({
        applied: [
          {
            id: "0002-b",
            description: "Migration 0002-b",
            appliedAt: APPLIED_AT.toISOString(),
          },
        ],
        migrations,
      }),
    ).toThrow("Workspace migration state is out of order");
  });
});

describe("runWorkspaceMigrations", () => {
  it("runs pending migrations in order", async () => {
    await withConfig(async (config) => {
      const logger = createLogger();
      const migrations = [markerMigration("0001-a", "a.txt"), markerMigration("0002-b", "b.txt")];

      const result = await runWorkspaceMigrations({
        config,
        logger: logger as never,
        migrations,
        now: () => APPLIED_AT,
      });

      expect(result.applied.map((migration) => migration.id)).toEqual(["0001-a", "0002-b"]);
      await expect(readFile(resolve(config.paths.workspaceDir, "a.txt"), "utf8")).resolves.toBe(
        "up",
      );
      await expect(readFile(resolve(config.paths.workspaceDir, "b.txt"), "utf8")).resolves.toBe(
        "up",
      );
      await expect(readWorkspaceMigrationState(config)).resolves.toEqual({
        version: 1,
        applied: [
          {
            id: "0001-a",
            description: "Migration 0001-a",
            appliedAt: APPLIED_AT.toISOString(),
          },
          {
            id: "0002-b",
            description: "Migration 0002-b",
            appliedAt: APPLIED_AT.toISOString(),
          },
        ],
      });
    });
  });

  it("skips already applied migrations", async () => {
    await withConfig(async (config) => {
      const logger = createLogger();
      const migration = markerMigration("0001-a", "a.txt");

      await runWorkspaceMigrations({
        config,
        logger: logger as never,
        migrations: [migration],
        now: () => APPLIED_AT,
      });
      await rm(resolve(config.paths.workspaceDir, "a.txt"));

      const result = await runWorkspaceMigrations({
        config,
        logger: logger as never,
        migrations: [migration],
        now: () => APPLIED_AT,
      });

      expect(result.applied).toEqual([]);
      await expect(readFile(resolve(config.paths.workspaceDir, "a.txt"), "utf8")).rejects.toThrow();
    });
  });

  it("stops at a failed migration without recording it", async () => {
    await withConfig(async (config) => {
      const logger = createLogger();
      const fail = vi.fn(() => Promise.reject(new Error("boom")));
      const later = markerMigration("0003-later", "later.txt");
      const migrations: WorkspaceMigration[] = [
        markerMigration("0001-a", "a.txt"),
        {
          id: "0002-fail",
          description: "Fail",
          up: fail,
          down() {
            return Promise.resolve();
          },
        },
        later,
      ];

      await expect(
        runWorkspaceMigrations({
          config,
          logger: logger as never,
          migrations,
          now: () => APPLIED_AT,
        }),
      ).rejects.toThrow("boom");

      expect(fail).toHaveBeenCalledOnce();
      await expect(readWorkspaceMigrationState(config)).resolves.toEqual({
        version: 1,
        applied: [
          {
            id: "0001-a",
            description: "Migration 0001-a",
            appliedAt: APPLIED_AT.toISOString(),
          },
        ],
      });
      await expect(
        readFile(resolve(config.paths.workspaceDir, "later.txt"), "utf8"),
      ).rejects.toThrow();
    });
  });
});

describe("rollbackLatestWorkspaceMigration", () => {
  it("rolls back only the latest applied migration", async () => {
    await withConfig(async (config) => {
      const logger = createLogger();
      const migrations = [markerMigration("0001-a", "a.txt"), markerMigration("0002-b", "b.txt")];

      await runWorkspaceMigrations({
        config,
        logger: logger as never,
        migrations,
        now: () => APPLIED_AT,
      });

      const result = await rollbackLatestWorkspaceMigration({
        config,
        logger: logger as never,
        migrations,
      });

      expect(result.rolledBack?.id).toBe("0002-b");
      await expect(readFile(resolve(config.paths.workspaceDir, "a.txt"), "utf8")).resolves.toBe(
        "up",
      );
      await expect(readFile(resolve(config.paths.workspaceDir, "b.txt"), "utf8")).rejects.toThrow();
      expect((await readWorkspaceMigrationState(config)).applied.map((item) => item.id)).toEqual([
        "0001-a",
      ]);
    });
  });

  it("leaves state unchanged when rollback fails", async () => {
    await withConfig(async (config) => {
      const logger = createLogger();
      const migration = markerMigration("0001-a", "a.txt");

      await runWorkspaceMigrations({
        config,
        logger: logger as never,
        migrations: [migration],
        now: () => APPLIED_AT,
      });

      await expect(
        rollbackLatestWorkspaceMigration({
          config,
          logger: logger as never,
          migrations: [
            {
              ...migration,
              down() {
                return Promise.reject(new Error("rollback failed"));
              },
            },
          ],
        }),
      ).rejects.toThrow("rollback failed");

      expect((await readWorkspaceMigrationState(config)).applied.map((item) => item.id)).toEqual([
        "0001-a",
      ]);
    });
  });

  it("no-ops when there are no applied migrations", async () => {
    await withConfig(async (config) => {
      const logger = createLogger();

      await expect(
        rollbackLatestWorkspaceMigration({
          config,
          logger: logger as never,
          migrations: [markerMigration("0001-a", "a.txt")],
        }),
      ).resolves.toEqual({});
    });
  });
});
