import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import { createDocumentsAgentsGuideMigration } from "../../src/workspace-migrations/migrations/0005-create-documents-agents-guide";
import { createDocumentsExamplesGuideMigration } from "../../src/workspace-migrations/migrations/0006-create-documents-examples-guide";
import {
  DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE,
  updateDocumentsAgentsGuideRootRuleMigration,
} from "../../src/workspace-migrations/migrations/0007-update-documents-agents-guide-root-rule";
import {
  DOCUMENTS_AGENTS_GUIDE_WITH_GLOBAL_TOOL_NAMES,
  updateDocumentsAgentsGuideGlobalToolNamesMigration,
} from "../../src/workspace-migrations/migrations/0009-update-documents-agents-guide-global-tool-names";
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
  const cwd = await mkdtemp(join(tmpdir(), "cc-documents-guide-global-tools-migration-"));
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
  migrations = [updateDocumentsAgentsGuideGlobalToolNamesMigration],
) {
  return runWorkspaceMigrations({
    config,
    logger: createLogger() as never,
    migrations,
    now: () => APPLIED_AT,
  });
}

describe("updateDocumentsAgentsGuideGlobalToolNamesMigration", () => {
  it("updates the seeded guide to use global document tool names", async () => {
    await withConfig(async (config) => {
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await mkdir(resolve(config.paths.workspaceDir, "Documents"), { recursive: true });
      await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE, "utf8");

      const result = await run(config);

      expect(result.applied.map((migration) => migration.id)).toEqual([
        "0009-update-documents-agents-guide-global-tool-names",
      ]);
      expect(await readFile(guidePath, "utf8")).toBe(DOCUMENTS_AGENTS_GUIDE_WITH_GLOBAL_TOOL_NAMES);
    });
  });

  it("updates old tool names inside a custom guide while preserving custom content", async () => {
    await withConfig(async (config) => {
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      const customGuide = [
        "# Custom guide",
        "",
        "Use register_project_document for shared docs.",
        "Use list_project_documents before editing.",
      ].join("\n");
      await mkdir(resolve(config.paths.workspaceDir, "Documents"), { recursive: true });
      await writeFile(guidePath, customGuide, "utf8");

      await run(config);

      expect(await readFile(guidePath, "utf8")).toBe(
        [
          "# Custom guide",
          "",
          "Use register_global_document for shared docs.",
          "Use list_global_documents before editing.",
        ].join("\n"),
      );
    });
  });

  it("leaves guide content unchanged when it has no old tool names", async () => {
    await withConfig(async (config) => {
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await mkdir(resolve(config.paths.workspaceDir, "Documents"), { recursive: true });
      await writeFile(guidePath, "# Custom guide\n", "utf8");

      const result = await run(config);

      expect(result.applied.map((migration) => migration.id)).toEqual([
        "0009-update-documents-agents-guide-global-tool-names",
      ]);
      expect(await readFile(guidePath, "utf8")).toBe("# Custom guide\n");
      expect((await readWorkspaceMigrationState(config)).applied.map((item) => item.id)).toEqual([
        "0009-update-documents-agents-guide-global-tool-names",
      ]);
    });
  });

  it("produces the updated guide when migrations run in order", async () => {
    await withConfig(async (config) => {
      await run(config, [
        createDocumentsAgentsGuideMigration,
        createDocumentsExamplesGuideMigration,
        updateDocumentsAgentsGuideRootRuleMigration,
        updateDocumentsAgentsGuideGlobalToolNamesMigration,
      ]);

      expect(await readFile(resolve(config.paths.workspaceDir, GUIDE), "utf8")).toBe(
        DOCUMENTS_AGENTS_GUIDE_WITH_GLOBAL_TOOL_NAMES,
      );
    });
  });

  it("rolls back by restoring the previous project tool names", async () => {
    await withConfig(async (config) => {
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await mkdir(resolve(config.paths.workspaceDir, "Documents"), { recursive: true });
      await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE, "utf8");
      await run(config);

      const result = await rollbackLatestWorkspaceMigration({
        config,
        logger: createLogger() as never,
        migrations: [updateDocumentsAgentsGuideGlobalToolNamesMigration],
      });

      expect(result.rolledBack?.id).toBe("0009-update-documents-agents-guide-global-tool-names");
      expect(await readFile(guidePath, "utf8")).toBe(DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE);
    });
  });
});
