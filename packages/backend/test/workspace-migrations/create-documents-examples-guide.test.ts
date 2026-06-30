import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import {
  DOCUMENTS_EXAMPLES_GUIDE,
  createDocumentsExamplesGuideMigration,
} from "../../src/workspace-migrations/migrations/0006-create-documents-examples-guide";
import { readWorkspaceMigrationState } from "../../src/workspace-migrations/state";
import {
  rollbackLatestWorkspaceMigration,
  runWorkspaceMigrations,
} from "../../src/workspace-migrations/service";

const APPLIED_AT = new Date("2026-06-30T00:00:00.000Z");
const GUIDE = "Documents/EXAMPLES.md";

async function withConfig(
  fn: (config: ReturnType<typeof loadRuntimeConfig>) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "cc-documents-examples-migration-"));
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
    migrations: [createDocumentsExamplesGuideMigration],
    now: () => APPLIED_AT,
  });
}

describe("createDocumentsExamplesGuideMigration", () => {
  it("creates Documents/ and seeds EXAMPLES.md on a fresh workspace", async () => {
    await withConfig(async (config) => {
      const result = await run(config);

      expect(result.applied.map((migration) => migration.id)).toEqual([
        "0006-create-documents-examples-guide",
      ]);
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await expect(exists(guidePath)).resolves.toBe(true);
      expect(await readFile(guidePath, "utf8")).toBe(DOCUMENTS_EXAMPLES_GUIDE);
      expect((await readWorkspaceMigrationState(config)).applied.map((item) => item.id)).toEqual([
        "0006-create-documents-examples-guide",
      ]);
    });
  });

  it("does not contain stray escaped backticks or dollar signs in code examples", () => {
    // Regression check: the embedded code/math examples must render the real
    // characters, not literal backslash-escaped sequences leaked from the
    // outer template literal.
    expect(DOCUMENTS_EXAMPLES_GUIDE).toContain('return "Hello, " + name + "!";');
    expect(DOCUMENTS_EXAMPLES_GUIDE).not.toContain("\\`");
    expect(DOCUMENTS_EXAMPLES_GUIDE).not.toContain("\\${");
  });

  it("embeds a real sample image as a data URI", () => {
    expect(DOCUMENTS_EXAMPLES_GUIDE).toContain(
      "![Sample embedded image](data:image/svg+xml;base64,",
    );
  });

  it("does not overwrite an existing EXAMPLES.md", async () => {
    await withConfig(async (config) => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(resolve(config.paths.workspaceDir, "Documents"), { recursive: true });
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await writeFile(guidePath, "# Custom examples\n", "utf8");

      await run(config);

      expect(await readFile(guidePath, "utf8")).toBe("# Custom examples\n");
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
        migrations: [createDocumentsExamplesGuideMigration],
      });

      expect(result.rolledBack?.id).toBe("0006-create-documents-examples-guide");
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
          migrations: [createDocumentsExamplesGuideMigration],
        }),
      ).rejects.toThrow("EXAMPLES.md");

      expect((await readWorkspaceMigrationState(config)).applied.map((item) => item.id)).toEqual([
        "0006-create-documents-examples-guide",
      ]);
      await expect(exists(guidePath)).resolves.toBe(true);
    });
  });
});
