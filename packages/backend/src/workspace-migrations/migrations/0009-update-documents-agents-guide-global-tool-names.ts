import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { WorkspaceMigration } from "../types.js";

import { DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE } from "./0007-update-documents-agents-guide-root-rule.js";

function agentsGuidePath(workspaceDir: string): string {
  return resolve(workspaceDir, "Documents", "AGENTS.md");
}

export const DOCUMENTS_AGENTS_GUIDE_WITH_GLOBAL_TOOL_NAMES =
  DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE.replaceAll(
    "register_project_document",
    "register_global_document",
  ).replaceAll("list_project_documents", "list_global_documents");

function replaceProjectToolNames(content: string): string {
  return content
    .replaceAll("register_project_document", "register_global_document")
    .replaceAll("list_project_documents", "list_global_documents");
}

function restoreProjectToolNames(content: string): string {
  return content
    .replaceAll("register_global_document", "register_project_document")
    .replaceAll("list_global_documents", "list_project_documents");
}

export const updateDocumentsAgentsGuideGlobalToolNamesMigration = {
  id: "0009-update-documents-agents-guide-global-tool-names",
  description: "Update the seeded Documents/AGENTS.md guide to use global document MCP tool names.",
  async up({ config }) {
    const guidePath = agentsGuidePath(config.paths.workspaceDir);
    const current = await readFileOrNull(guidePath);
    if (current === null) {
      return;
    }
    const updated = replaceProjectToolNames(current);
    if (updated === current) {
      return;
    }
    await writeFile(guidePath, updated, "utf8");
  },
  async down({ config }) {
    const guidePath = agentsGuidePath(config.paths.workspaceDir);
    const current = await readFileOrNull(guidePath);
    if (current === null) {
      return;
    }
    const reverted = restoreProjectToolNames(current);
    if (reverted === current) {
      return;
    }
    await writeFile(guidePath, reverted, "utf8");
  },
} satisfies WorkspaceMigration;

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
