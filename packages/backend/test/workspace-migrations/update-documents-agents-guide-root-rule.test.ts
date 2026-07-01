import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import {
  DOCUMENTS_AGENTS_GUIDE,
  createDocumentsAgentsGuideMigration,
} from "../../src/workspace-migrations/migrations/0005-create-documents-agents-guide";
import { createDocumentsExamplesGuideMigration } from "../../src/workspace-migrations/migrations/0006-create-documents-examples-guide";
import {
  DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE,
  updateDocumentsAgentsGuideRootRuleMigration,
} from "../../src/workspace-migrations/migrations/0007-update-documents-agents-guide-root-rule";
import { readWorkspaceMigrationState } from "../../src/workspace-migrations/state";
import {
  rollbackLatestWorkspaceMigration,
  runWorkspaceMigrations,
} from "../../src/workspace-migrations/service";

const APPLIED_AT = new Date("2026-07-01T00:00:00.000Z");
const GUIDE = "Documents/AGENTS.md";

async function withConfig(
  fn: (config: ReturnType<typeof loadRuntimeConfig>) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "cc-documents-guide-root-rule-migration-"));
  try {
    await fn(loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } }));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function run(
  config: ReturnType<typeof loadRuntimeConfig>,
  migrations = [updateDocumentsAgentsGuideRootRuleMigration],
) {
  return runWorkspaceMigrations({
    config,
    logger: createLogger() as never,
    migrations,
    now: () => APPLIED_AT,
  });
}

describe("updateDocumentsAgentsGuideRootRuleMigration", () => {
  it("updates the unchanged seeded guide to require subfolders", async () => {
    await withConfig(async (config) => {
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await mkdir(resolve(config.paths.workspaceDir, "Documents"), { recursive: true });
      await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE, "utf8");

      const result = await run(config);

      expect(result.applied.map((migration) => migration.id)).toEqual([
        "0007-update-documents-agents-guide-root-rule",
      ]);
      expect(await readFile(guidePath, "utf8")).toBe(DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE);
      expect((await readWorkspaceMigrationState(config)).applied.map((item) => item.id)).toEqual([
        "0007-update-documents-agents-guide-root-rule",
      ]);
    });
  });

  it("produces the updated guide on a fresh workspace when migrations run in order", async () => {
    await withConfig(async (config) => {
      await run(config, [
        createDocumentsAgentsGuideMigration,
        createDocumentsExamplesGuideMigration,
        updateDocumentsAgentsGuideRootRuleMigration,
      ]);

      expect(await readFile(resolve(config.paths.workspaceDir, GUIDE), "utf8")).toBe(
        DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE,
      );
    });
  });

  it("does not overwrite a custom guide", async () => {
    await withConfig(async (config) => {
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await mkdir(resolve(config.paths.workspaceDir, "Documents"), { recursive: true });
      await writeFile(guidePath, "# Custom guide\n", "utf8");

      await run(config);

      expect(await readFile(guidePath, "utf8")).toBe("# Custom guide\n");
    });
  });

  it("includes the root-only-folder rule in the updated guide text", () => {
    expect(DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE).toContain(
      "The path must include at least one folder segment: do not\ncreate files directly in the root of `Documents/`.",
    );
    expect(DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE).toContain(
      "The `Documents/` root is for\n  folders only.",
    );
  });

  it("is a no-op when re-run after success", async () => {
    await withConfig(async (config) => {
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await mkdir(resolve(config.paths.workspaceDir, "Documents"), { recursive: true });
      await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE, "utf8");

      await run(config);
      const second = await run(config);

      expect(second.applied).toEqual([]);
      expect(await readFile(guidePath, "utf8")).toBe(DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE);
    });
  });

  it("rolls back by restoring the previous seeded guide text", async () => {
    await withConfig(async (config) => {
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await mkdir(resolve(config.paths.workspaceDir, "Documents"), { recursive: true });
      await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE, "utf8");
      await run(config);

      const result = await rollbackLatestWorkspaceMigration({
        config,
        logger: createLogger() as never,
        migrations: [updateDocumentsAgentsGuideRootRuleMigration],
      });

      expect(result.rolledBack?.id).toBe("0007-update-documents-agents-guide-root-rule");
      expect(await readFile(guidePath, "utf8")).toBe(DOCUMENTS_AGENTS_GUIDE);
      await expect(readWorkspaceMigrationState(config)).resolves.toEqual({
        version: 1,
        applied: [],
      });
    });
  });
});
