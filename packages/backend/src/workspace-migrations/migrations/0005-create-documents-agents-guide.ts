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

This folder holds the project's **Documents** — shared, human-readable markdown
files that capture lasting project context (specs, plans, overviews, decisions).
They are first-class, portable workspace files: the markdown on disk is the
source of truth. SQLite only stores derived metadata (title, description,
author, timestamps) and is rebuilt from these files on boot.

## What lives here

- Markdown files (\`.md\` or \`.markdown\`) under \`Documents/\`, organized in folders.
- This \`AGENTS.md\` guide.
- Hidden files/folders, \`node_modules\`, and non-markdown files are ignored by the
  Documents tree (but markdown can still *reference* other workspace files — see
  "Referencing workspace files" below).

## How they are accessed

- **Documents page** (UI): a WYSIWYG markdown editor (Milkdown). Browse the tree
  from the left sidebar; open a document to edit it.
- **Global search**: documents appear in a dedicated "Documents" group.
- **Mentions**: type \`#\` in chat/task composers to reference a document; selecting
  one inserts \`Documents/<relative-path>\`.
- **HTTP API**: \`/api/documents/*\` (tree, search, file, content, metadata, asset).

## How specialists create / update documents

Use the default MCP tools:

- \`list_project_documents\` — list documents with relative path, full path,
  title, and short description.
- \`register_project_document\` — create a markdown file if missing, or update its
  metadata without overwriting content. \`path\` is relative to \`Documents/\`
  (e.g. \`design/overview.md\`).

When running inside a task, also attach the document with \`add_task_artifact\`
using \`type: "document"\` and the same \`Documents/\`-relative path, so the user can
open it directly in the Documents module.

You may also write \`.md\` files here directly with normal file tools. New
documents created through the UI default to the \`.md\` extension.

## What documents support

- CommonMark + GFM markdown.
- Metadata: title, short description, and author (stored separately; editing
  metadata does not rewrite the document body).
- Images: uploaded/pasted images are embedded inline as base64 data URIs so the
  document stays self-contained.

## Referencing workspace files and images

To reference an existing file already in the workspace (for example an image a
specialist produced elsewhere) instead of embedding a copy, use a
\`workspace:\`-prefixed path that is **relative to the workspace root**:

\`\`\`markdown
![Architecture diagram](workspace:tools/researcher/diagram.png)
\`\`\`

The editor resolves \`workspace:\` references through \`/api/documents/asset\` for
display while keeping the reference itself in the markdown, so the document stays
portable. Plain \`http(s):\` and \`data:\` URLs are used as-is.

## Path rules

- Document paths are relative to \`Documents/\`, must use \`/\` separators, and must
  not contain \`..\`, empty, or hidden segments.
- \`workspace:\` asset references are relative to the workspace root and must stay
  inside it.
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
