import { Children, useState } from "react";

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
        components={{
          code: Code,
        }}
        rehypePlugins={[[rehypeSanitize, markdownSchema]]}
        urlTransform={transformMarkdownUrl}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function Code(props: React.ComponentProps<"code"> & { inline?: boolean }) {
  const { inline, className, children, ...rest } = props;
  const value = Children.toArray(children)
    .map((child) => (typeof child === "string" ? child : ""))
    .join("");
  const isInline = inline ?? (!className && !value.includes("\n"));

  if (!isInline) {
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  }

  return <InlineCopyCode className={className} value={value} {...rest} />;
}

function InlineCopyCode(props: React.ComponentProps<"code"> & { value: string }) {
  const { value, className, ...rest } = props;
  const [copied, setCopied] = useState(false);

  return (
    <code
      {...rest}
      className={`${className ?? ""} cursor-pointer rounded-md transition-colors ${
        copied ? "bg-emerald-500/15 text-emerald-700" : "hover:bg-surface-elevated"
      }`}
      onClick={() => void handleCopy()}
      title={copied ? "Copied" : "Click to copy"}
    >
      {value}
    </code>
  );

  async function handleCopy() {
    await navigator.clipboard.writeText(value).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
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
