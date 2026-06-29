import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { WorkspaceMigration } from "../types.js";
import { DOCUMENTS_AGENTS_GUIDE as PREVIOUS_GUIDE } from "./0005-create-documents-agents-guide.js";

function agentsGuidePath(workspaceDir: string): string {
  return resolve(workspaceDir, "Documents", "AGENTS.md");
}

/**
 * Rewritten Documents/AGENTS.md, addressed to AI specialists (not humans):
 * creating documents is MCP-only, editing is via normal file tools, and the
 * human UI is just a heads-up. Drops app-internal storage detail.
 */
export const DOCUMENTS_AGENTS_GUIDE = `# Documents

This folder holds the project's shared **Documents**: markdown files that capture
lasting project context — specs, plans, overviews, decisions, research notes.
This guide is written for AI specialists working in this workspace.

## Creating a document

Create new documents **only** with the \`register_project_document\` MCP tool. It
creates the markdown file (and any missing parent folders) and registers it so it
is discoverable. Pass \`path\` relative to \`Documents/\` (for example
\`design/overview.md\`) plus an optional \`title\` and short \`description\`.

Do not create document files any other way — always go through
\`register_project_document\` so the document is registered consistently.

## Editing a document

To change a document's contents, edit its markdown file directly with your normal
file read/write/edit tools. The file lives at \`Documents/<path>\` in the
workspace. Do not use \`register_project_document\` to rewrite a body — it is for
creating and registering, not editing content.

Use \`list_project_documents\` to discover existing documents (relative path, full
path, title, description).

## Referencing workspace files and images

To show an existing workspace file (for example an image you produced elsewhere)
inside a document, reference it with a \`workspace:\` path relative to the
workspace root instead of copying it in:

\`\`\`markdown
![Architecture diagram](workspace:tools/researcher/diagram.png)
\`\`\`

These references render in the document and stay portable. Plain \`http(s):\` links
are used as-is.

## Tasks

When you create or update a document during a task run, attach it to the run with
\`add_task_artifact\` using \`type: "document"\` and the same \`Documents/\`-relative
path, so it can be opened directly from the task.

## Supported content

CommonMark and GitHub-flavored markdown. Each document also carries a title,
short description, and author tracked alongside it.

## Path rules

- Document paths are relative to \`Documents/\`, use \`/\` separators, and must not
  contain \`..\`, empty, or hidden segments.
- \`workspace:\` references are relative to the workspace root and must stay inside
  it.

## The human UI (for your awareness)

Users can browse, open, edit, search, and manage these documents through the
app's Documents interface (a rich markdown editor). You do not drive that UI —
just know that anything you create or edit here is immediately visible and
editable by the user there.
`;

export const updateDocumentsAgentsGuideMigration = {
  id: "0006-update-documents-agents-guide",
  description: "Rewrite Documents/AGENTS.md for AI specialists (MCP create, file-tool edit).",
  async up({ config }) {
    const guidePath = agentsGuidePath(config.paths.workspaceDir);
    const current = await readFileOrNull(guidePath);
    // Only upgrade the unmodified previous seed. Leave user-edited or already
    // up-to-date guides untouched; if it is missing, the 0005 migration owns
    // creation, so do nothing here.
    if (current === null || current.trim() !== PREVIOUS_GUIDE.trim()) {
      return;
    }
    await writeFile(guidePath, DOCUMENTS_AGENTS_GUIDE, "utf8");
  },
  async down({ config }) {
    const guidePath = agentsGuidePath(config.paths.workspaceDir);
    const current = await readFileOrNull(guidePath);
    // Reverse only our own unmodified rewrite.
    if (current === null || current.trim() !== DOCUMENTS_AGENTS_GUIDE.trim()) {
      return;
    }
    await writeFile(guidePath, PREVIOUS_GUIDE, "utf8");
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
