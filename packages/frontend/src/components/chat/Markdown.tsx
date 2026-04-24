import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

type MarkdownProps = { content: string };

const markdownSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.["img"] ?? []), ["src"], ["alt"], ["title"]],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: ["http", "https", "data", "blob"],
  },
} satisfies typeof defaultSchema;

export function Markdown({ content }: MarkdownProps) {
  return (
    <div className="prose prose-sm max-w-none text-text-primary [&_img]:rounded-lg [&_img]:border [&_img]:border-border [&_img]:bg-surface [&_img]:p-1 [&_img]:shadow-sm [&_pre]:bg-surface [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:text-sm [&_code]:text-sm [&_code]:bg-surface [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_a]:text-accent [&_a]:underline [&_p]:leading-6 [&_li]:leading-6">
      <ReactMarkdown
        rehypePlugins={[[rehypeSanitize, markdownSchema]]}
        urlTransform={transformMarkdownUrl}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function transformMarkdownUrl(
  url: string,
  key: string,
  node: Readonly<{ tagName?: string }>,
): string {
  if (node.tagName === "img" && key === "src") {
    if (url.startsWith("data:image/") || url.startsWith("blob:")) {
      return url;
    }
  }

  return defaultUrlTransform(url);
}
