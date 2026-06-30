import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { WorkspaceMigration } from "../types.js";

function documentsDir(workspaceDir: string): string {
  return resolve(workspaceDir, "Documents");
}

function agentsGuidePath(workspaceDir: string): string {
  return resolve(documentsDir(workspaceDir), "AGENTS.md");
}

/**
 * Seeded guide explaining the Documents module to specialists/agents that read
 * the workspace. Kept as a single source string so rollback can verify the file
 * is still the seeded version before removing it.
 */
export const DOCUMENTS_AGENTS_GUIDE = `# Documents

This folder holds the project's **Documents**: shared markdown files that capture
lasting project context (specs, plans, overviews, decisions, references) so it
persists across sessions and is available to every specialist.

Documents are markdown files (\`.md\` / \`.markdown\`) under \`Documents/\`, organized
in folders.

## Creating a new document

Create new documents **only** with the \`register_project_document\` MCP tool. Give
it a \`path\` relative to \`Documents/\` (e.g. \`design/overview.md\`); it creates the
file and registers it. Do not create documents by other means — this keeps them
registered and discoverable.

## Editing an existing document

Edit existing documents by editing the \`.md\` file directly with your normal file
editing tools. Do not use MCP tools to rewrite document content;
\`register_project_document\` is for creation and metadata only and will not
overwrite an existing file's body.

## Finding documents

Use \`list_project_documents\` to list documents with their relative path, full
path, title, and short description.

## Linking a document to a task

When you create or update a document during a task run, attach it with
\`add_task_artifact\` using \`type: "document"\` and the same \`Documents/\`-relative
path, so it is surfaced as a task artifact.

## What documents support

- CommonMark + GFM markdown.
- Metadata: title, short description, and author.
- Images embedded inline, or references to existing workspace files (below).

## Referencing workspace files and images

To reference a file that already exists in the workspace (for example an image
produced elsewhere) instead of embedding a copy, use a \`workspace:\`-prefixed path
relative to the workspace root:

\`\`\`markdown
![Architecture diagram](workspace:tools/researcher/diagram.png)
\`\`\`

Plain \`http(s):\` and \`data:\` URLs are used as-is.

## Path rules

- Document paths are relative to \`Documents/\`, use \`/\` separators, and must not
  contain \`..\`, empty, or hidden segments.
- \`workspace:\` references are relative to the workspace root and must stay inside
  it.

## Note on human access

The operator can browse, open, edit, and manage these documents through the app's
Documents UI (a rich markdown editor with search and a folder tree). Documents you
create or update here are immediately visible to them there.
`;

export const createDocumentsAgentsGuideMigration = {
  id: "0005-create-documents-agents-guide",
  description:
    "Create the Documents/ folder and seed an AGENTS.md guide describing the Documents module.",
  async up({ config }) {
    // Migrations run before the subdirectory bootstrap, so create Documents/
    // here. Idempotent: only seed AGENTS.md when it does not already exist, so
    // user edits are never overwritten.
    await mkdir(documentsDir(config.paths.workspaceDir), { recursive: true });

    const guidePath = agentsGuidePath(config.paths.workspaceDir);
    if (await fileExists(guidePath)) {
      return;
    }
    await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE, "utf8");
  },
  async down({ config }) {
    const guidePath = agentsGuidePath(config.paths.workspaceDir);
    const current = await readFileOrNull(guidePath);
    if (current === null) {
      return; // Already gone; nothing to roll back.
    }
    if (current.trim() !== DOCUMENTS_AGENTS_GUIDE.trim()) {
      throw new Error(
        `Cannot remove ${guidePath}: it was edited after seeding. Remove it manually before rolling back.`,
      );
    }
    await rm(guidePath, { force: true });
  },
} satisfies WorkspaceMigration;

async function fileExists(path: string): Promise<boolean> {
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
