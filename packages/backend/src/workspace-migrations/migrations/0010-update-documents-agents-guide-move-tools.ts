import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { WorkspaceMigration } from "../types.js";

import { DOCUMENTS_AGENTS_GUIDE_WITH_GLOBAL_TOOL_NAMES } from "./0009-update-documents-agents-guide-global-tool-names.js";

function agentsGuidePath(workspaceDir: string): string {
  return resolve(workspaceDir, "Documents", "AGENTS.md");
}

const MOVE_SECTION = `## Moving or renaming a document

Move or rename a document with the \`move_global_document\` MCP tool (or
\`move_private_document\` for your private specialist documents). Give it the
current \`fromPath\` and the new \`toPath\`, both relative to \`Documents/\`. This
preserves the document's stored metadata (title, description, author, id) and
creates any missing destination folders automatically. Do not move or rename
document files by hand — that drops their registered metadata.

`;

// Insert the move-tool section immediately before "## Finding documents" so the
// creation/editing/moving instructions read in order.
export const DOCUMENTS_AGENTS_GUIDE_WITH_MOVE_TOOLS =
  DOCUMENTS_AGENTS_GUIDE_WITH_GLOBAL_TOOL_NAMES.replace(
    "## Finding documents",
    `${MOVE_SECTION}## Finding documents`,
  );

export const updateDocumentsAgentsGuideMoveToolsMigration = {
  id: "0010-update-documents-agents-guide-move-tools",
  description:
    "Update the seeded Documents/AGENTS.md guide to document the move_global_document and move_private_document MCP tools.",
  async up({ config }) {
    const guidePath = agentsGuidePath(config.paths.workspaceDir);
    const current = await readFileOrNull(guidePath);
    if (current === null) {
      return;
    }
    if (current.trim() !== DOCUMENTS_AGENTS_GUIDE_WITH_GLOBAL_TOOL_NAMES.trim()) {
      return;
    }
    await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE_WITH_MOVE_TOOLS, "utf8");
  },
  async down({ config }) {
    const guidePath = agentsGuidePath(config.paths.workspaceDir);
    const current = await readFileOrNull(guidePath);
    if (current === null) {
      return;
    }
    if (current.trim() !== DOCUMENTS_AGENTS_GUIDE_WITH_MOVE_TOOLS.trim()) {
      return;
    }
    await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE_WITH_GLOBAL_TOOL_NAMES, "utf8");
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
