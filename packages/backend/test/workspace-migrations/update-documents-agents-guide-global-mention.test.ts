import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import { createDocumentsAgentsGuideMigration } from "../../src/workspace-migrations/migrations/0005-create-documents-agents-guide";
import { createDocumentsExamplesGuideMigration } from "../../src/workspace-migrations/migrations/0006-create-documents-examples-guide";
import { updateDocumentsAgentsGuideRootRuleMigration } from "../../src/workspace-migrations/migrations/0007-update-documents-agents-guide-root-rule";
import { updateDocumentsAgentsGuideGlobalToolNamesMigration } from "../../src/workspace-migrations/migrations/0009-update-documents-agents-guide-global-tool-names";
import {
  DOCUMENTS_AGENTS_GUIDE_WITH_MOVE_TOOLS,
  updateDocumentsAgentsGuideMoveToolsMigration,
} from "../../src/workspace-migrations/migrations/0010-update-documents-agents-guide-move-tools";
import {
  DOCUMENTS_AGENTS_GUIDE_WITH_GLOBAL_MENTION,
  updateDocumentsAgentsGuideGlobalMentionMigration,
} from "../../src/workspace-migrations/migrations/0011-update-documents-agents-guide-global-mention";
import {
  rollbackLatestWorkspaceMigration,
  runWorkspaceMigrations,
} from "../../src/workspace-migrations/service";

const APPLIED_AT = new Date("2026-07-01T00:00:00.000Z");
const GUIDE = "Documents/AGENTS.md";

async function withConfig(
  fn: (config: ReturnType<typeof loadRuntimeConfig>) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "cc-documents-guide-global-mention-migration-"));
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
  migrations = [updateDocumentsAgentsGuideGlobalMentionMigration],
) {
  return runWorkspaceMigrations({
    config,
    logger: createLogger() as never,
    migrations,
    now: () => APPLIED_AT,
  });
}

describe("updateDocumentsAgentsGuideGlobalMentionMigration", () => {
  it("adds the #GlobalDocuments reference section to the seeded guide", async () => {
    await withConfig(async (config) => {
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await mkdir(resolve(config.paths.workspaceDir, "Documents"), { recursive: true });
      await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE_WITH_MOVE_TOOLS, "utf8");

      const result = await run(config);

      expect(result.applied.map((migration) => migration.id)).toEqual([
        "0011-update-documents-agents-guide-global-mention",
      ]);
      const updated = await readFile(guidePath, "utf8");
      expect(updated).toBe(DOCUMENTS_AGENTS_GUIDE_WITH_GLOBAL_MENTION);
      expect(updated).toContain("## Referencing a global document from a prompt");
      expect(updated).toContain("#GlobalDocuments/<path>");
      expect(updated).toContain("list_global_documents");
    });
  });

  it("leaves a customized guide unchanged", async () => {
    await withConfig(async (config) => {
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await mkdir(resolve(config.paths.workspaceDir, "Documents"), { recursive: true });
      await writeFile(guidePath, "# Custom guide\n", "utf8");

      await run(config);

      expect(await readFile(guidePath, "utf8")).toBe("# Custom guide\n");
    });
  });

  it("produces the updated guide when migrations run in order", async () => {
    await withConfig(async (config) => {
      await run(config, [
        createDocumentsAgentsGuideMigration,
        createDocumentsExamplesGuideMigration,
        updateDocumentsAgentsGuideRootRuleMigration,
        updateDocumentsAgentsGuideGlobalToolNamesMigration,
        updateDocumentsAgentsGuideMoveToolsMigration,
        updateDocumentsAgentsGuideGlobalMentionMigration,
      ]);

      expect(await readFile(resolve(config.paths.workspaceDir, GUIDE), "utf8")).toBe(
        DOCUMENTS_AGENTS_GUIDE_WITH_GLOBAL_MENTION,
      );
    });
  });

  it("rolls back by restoring the pre-mention guide", async () => {
    await withConfig(async (config) => {
      const guidePath = resolve(config.paths.workspaceDir, GUIDE);
      await mkdir(resolve(config.paths.workspaceDir, "Documents"), { recursive: true });
      await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE_WITH_MOVE_TOOLS, "utf8");
      await run(config);

      const result = await rollbackLatestWorkspaceMigration({
        config,
        logger: createLogger() as never,
        migrations: [updateDocumentsAgentsGuideGlobalMentionMigration],
      });

      expect(result.rolledBack?.id).toBe("0011-update-documents-agents-guide-global-mention");
      expect(await readFile(guidePath, "utf8")).toBe(DOCUMENTS_AGENTS_GUIDE_WITH_MOVE_TOOLS);
    });
  });
});
