import { slugifyIdentifier } from "../lib/slug.js";

export function renderEmbeddedToolTemplate(name: string, description: string): string {
  const slug = slugifyIdentifier(name);
  return `import type { Plugin } from "@opencode/plugin";

export function createToolPlugin(name: string): Plugin.Plugin {
  return {
    id: "cc.custom." + name,
    async setup(context) {
      await context.tool.transform((editor) => {
        editor.add({
          name,
          description: ${JSON.stringify(description || name)},
          input: { type: "object", properties: {}, additionalProperties: false },
          options: { namespace: "cc_custom", codemode: false },
          execute: () => Promise.resolve({ content: "Implement this tool." }),
        });
      });
    },
  };
}

export default createToolPlugin(${JSON.stringify(slug)});
`;
}

export function renderEmbeddedToolEntry(slug: string, entryFile: string): string {
  const specifier = `./${slug}/${entryFile}`;
  return `import { createToolPlugin } from ${JSON.stringify(specifier)};\nexport default createToolPlugin(${JSON.stringify(slug)});\n`;
}
