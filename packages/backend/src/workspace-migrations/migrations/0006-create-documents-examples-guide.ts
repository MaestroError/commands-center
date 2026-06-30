import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { WorkspaceMigration } from "../types.js";

function documentsDir(workspaceDir: string): string {
  return resolve(workspaceDir, "Documents");
}

function examplesGuidePath(workspaceDir: string): string {
  return resolve(documentsDir(workspaceDir), "EXAMPLES.md");
}

// Tiny inline placeholder image (a blue rounded rect labeled "IMG"), used so the
// "uploaded image" example below renders for real instead of just describing it.
const SAMPLE_EMBEDDED_IMAGE =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI0MCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjQwIiByeD0iNiIgZmlsbD0iIzI1NjNlYiIvPjx0ZXh0IHg9IjMyIiB5PSIyNSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5JTUc8L3RleHQ+PC9zdmc+";

/**
 * Human-facing companion to AGENTS.md: a tour of the markdown features the
 * document editor supports, with the exact syntax for each. Kept as a single
 * source string so rollback can verify the file is still the seeded version.
 */
export const DOCUMENTS_EXAMPLES_GUIDE = `# Examples

A tour of the formatting you can use in documents, with the exact markdown for
each. In the editor you can also press **/** to open the block menu, or select
text to reveal the inline formatting toolbar.

## Headings

# Heading 1

## Heading 2

### Heading 3

\`\`\`markdown
# Heading 1
## Heading 2
### Heading 3
\`\`\`

## Text styles

**Bold**, *italic*, ~~strikethrough~~, and \`inline code\`.

\`\`\`markdown
**Bold**, *italic*, ~~strikethrough~~, and \`inline code\`.
\`\`\`

## Lists

- Bullet item
  - Nested item

1. First
2. Second

- [ ] To-do (unchecked)
- [x] Done

\`\`\`markdown
- Bullet item
  - Nested item

1. First
2. Second

- [ ] To-do
- [x] Done
\`\`\`

## Links

[Visit the docs](https://example.com)

\`\`\`markdown
[Link text](https://example.com)
\`\`\`

## Quotes

> A blockquote, handy for callouts or citations.

\`\`\`markdown
> A blockquote.
\`\`\`

## Code blocks

\`\`\`ts
export function greet(name: string): string {
  return "Hello, " + name + "!";
}
\`\`\`

Start a line with three backticks followed by a language name (e.g. \`ts\`,
\`bash\`, \`json\`), write your code, then close with three backticks.

## Math

Inline math: $E = mc^2$. Block math:

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

\`\`\`markdown
Inline math: $E = mc^2$.

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$
\`\`\`

## Tables

| Feature | Supported |
| --- | --- |
| Tables | Yes |
| Images | Yes |

\`\`\`markdown
| Feature | Supported |
| --- | --- |
| Tables | Yes |
\`\`\`

## Horizontal rule

---

\`\`\`markdown
---
\`\`\`

## Images

There are three ways to add an image.

### 1. Upload (embedded in the document)

Add an image block (press **/** → **Image**, or drag a file in) and choose
**Upload file**. The image is embedded directly in the document so it travels
with the file. Best for small images. Here is one embedded this way:

![Sample embedded image](${SAMPLE_EMBEDDED_IMAGE})

### 2. Link to an external image

In the image block, choose **paste link** and enter a URL:

\`\`\`markdown
![Alt text](https://example.com/image.png)
\`\`\`

### 3. Reference an image already in the workspace

Press **/** → **Workspace file**, search, and pick an image. It is inserted as a
portable reference and rendered inline:

\`\`\`markdown
![diagram.png](workspace:tools/researcher/diagram.png)
\`\`\`

The \`workspace:\` path is relative to the workspace root.

## Linking to a workspace file (non-image)

Press **/** → **Workspace file** and pick any non-image file (PDF, dataset,
etc.). It is inserted as a link that opens the file in the File Manager:

\`\`\`markdown
[tools/researcher/report.pdf](/files?root=workspace&path=tools/researcher&select=tools/researcher/report.pdf)
\`\`\`

## Document metadata

Title, short description, and author are edited from the **Actions** tab in
the right-hand panel — they're stored separately and don't change this
document's content.

## Tips

- Press **/** at the start of a line for the block menu (headings, lists,
  quote, code, table, image, math, and **Workspace file**).
- Select text to reveal inline formatting (bold, italic, link, code).
- Use **Save** in the document header to persist your changes.
`;

export const createDocumentsExamplesGuideMigration = {
  id: "0006-create-documents-examples-guide",
  description:
    "Seed Documents/EXAMPLES.md, a human-facing guide to the markdown features the editor supports.",
  async up({ config }) {
    await mkdir(documentsDir(config.paths.workspaceDir), { recursive: true });

    const guidePath = examplesGuidePath(config.paths.workspaceDir);
    if (await fileExists(guidePath)) {
      return;
    }
    await writeFile(guidePath, DOCUMENTS_EXAMPLES_GUIDE, "utf8");
  },
  async down({ config }) {
    const guidePath = examplesGuidePath(config.paths.workspaceDir);
    const current = await readFileOrNull(guidePath);
    if (current === null) {
      return; // Already gone; nothing to roll back.
    }
    if (current.trim() !== DOCUMENTS_EXAMPLES_GUIDE.trim()) {
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
