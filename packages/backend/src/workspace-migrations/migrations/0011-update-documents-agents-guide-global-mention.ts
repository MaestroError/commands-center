import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { WorkspaceMigration } from "../types.js";

import { DOCUMENTS_AGENTS_GUIDE_WITH_MOVE_TOOLS } from "./0010-update-documents-agents-guide-move-tools.js";

function agentsGuidePath(workspaceDir: string): string {
  return resolve(workspaceDir, "Documents", "AGENTS.md");
}

const GLOBAL_MENTION_SECTION = `## Referencing a global document from a prompt

A prompt may reference a shared global document with a \`#GlobalDocuments/<path>\`
token, where \`<path>\` is relative to the global \`Documents/\` root (for example
\`#GlobalDocuments/design/overview.md\`). This is deliberately distinct from a plain
\`#<path>\` workspace reference: it points at a **global** document, not a file in
your own workspace (where \`#Documents/...\` would resolve to your private
documents). To act on it, find it with \`list_global_documents\` — match on the
relative path to get its full path — then read that file to load the content.

`;

// Insert the global-mention convention immediately before "## Linking a document
// to a task" so it reads right after "## Finding documents".
export const DOCUMENTS_AGENTS_GUIDE_WITH_GLOBAL_MENTION =
  DOCUMENTS_AGENTS_GUIDE_WITH_MOVE_TOOLS.replace(
    "## Linking a document to a task",
    `${GLOBAL_MENTION_SECTION}## Linking a document to a task`,
  );

export const updateDocumentsAgentsGuideGlobalMentionMigration = {
  id: "0011-update-documents-agents-guide-global-mention",
  description:
    "Update the seeded Documents/AGENTS.md guide to document the #GlobalDocuments/ prompt reference convention.",
  async up({ config }) {
    const guidePath = agentsGuidePath(config.paths.workspaceDir);
    const current = await readFileOrNull(guidePath);
    if (current === null) {
      return;
    }
    if (current.trim() !== DOCUMENTS_AGENTS_GUIDE_WITH_MOVE_TOOLS.trim()) {
      return;
    }
    await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE_WITH_GLOBAL_MENTION, "utf8");
  },
  async down({ config }) {
    const guidePath = agentsGuidePath(config.paths.workspaceDir);
    const current = await readFileOrNull(guidePath);
    if (current === null) {
      return;
    }
    if (current.trim() !== DOCUMENTS_AGENTS_GUIDE_WITH_GLOBAL_MENTION.trim()) {
      return;
    }
    await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE_WITH_MOVE_TOOLS, "utf8");
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
