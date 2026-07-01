import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { WorkspaceMigration } from "../types.js";

import { DOCUMENTS_AGENTS_GUIDE } from "./0005-create-documents-agents-guide.js";

function agentsGuidePath(workspaceDir: string): string {
  return resolve(workspaceDir, "Documents", "AGENTS.md");
}

export const DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE = `# Documents

This folder holds the project's **Documents**: shared markdown files that capture
lasting project context (specs, plans, overviews, decisions, references) so it
persists across sessions and is available to every specialist.

Documents are markdown files (\`.md\` / \`.markdown\`) under \`Documents/\`, organized
in folders.

## Creating a new document

Create new documents **only** with the \`register_project_document\` MCP tool. Give
it a \`path\` relative to \`Documents/\` (e.g. \`design/overview.md\`); it creates the
file and registers it. The path must include at least one folder segment: do not
create files directly in the root of \`Documents/\`. In the root of
\`Documents/\`, create folders only. Do not create documents by other means —
this keeps them registered and discoverable.

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
- New documents must live in at least one folder under \`Documents/\` (for example
  \`design/overview.md\`, not \`overview.md\`). The \`Documents/\` root is for
  folders only.
- \`workspace:\` references are relative to the workspace root and must stay inside
  it.

## Note on human access

The operator can browse, open, edit, and manage these documents through the app's
Documents UI (a rich markdown editor with search and a folder tree). Documents you
create or update here are immediately visible to them there.
`;

export const updateDocumentsAgentsGuideRootRuleMigration = {
  id: "0007-update-documents-agents-guide-root-rule",
  description:
    "Update the seeded Documents/AGENTS.md guide to require new files inside subfolders, not at the Documents root.",
  async up({ config }) {
    const guidePath = agentsGuidePath(config.paths.workspaceDir);
    const current = await readFileOrNull(guidePath);
    if (current === null) {
      return;
    }
    if (current.trim() !== DOCUMENTS_AGENTS_GUIDE.trim()) {
      return;
    }
    await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE, "utf8");
  },
  async down({ config }) {
    const guidePath = agentsGuidePath(config.paths.workspaceDir);
    const current = await readFileOrNull(guidePath);
    if (current === null) {
      return;
    }
    if (current.trim() !== DOCUMENTS_AGENTS_GUIDE_WITH_ROOT_RULE.trim()) {
      return;
    }
    await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE, "utf8");
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
