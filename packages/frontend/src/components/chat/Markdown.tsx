import { Children, useState, type ReactNode } from "react";
import { Copy } from "lucide-react";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

type MarkdownProps = { className?: string; content: string };

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

export function Markdown({ className, content }: MarkdownProps) {
  return (
    <div className={`cc-md ${className ?? ""}`}>
      <ReactMarkdown
        components={{
          code: Code,
          pre: Pre,
          a: Anchor,
          table: Table,
        }}
        rehypePlugins={[[rehypeSanitize, markdownSchema]]}
        urlTransform={transformMarkdownUrl}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function childrenToText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => (typeof child === "string" ? child : ""))
    .join("");
}

// Pre is a passthrough: fenced code is rendered as a full `.md-codeblock`
// by the Code component, so we avoid wrapping a <div> inside <pre>.
function Pre(props: { children?: ReactNode }) {
  return <>{props.children}</>;
}

function Anchor(props: React.ComponentProps<"a">) {
  const { href, children, ...rest } = props;
  const external = typeof href === "string" && /^https?:/i.test(href);
  return (
    <a
      href={href}
      {...rest}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

function Table(props: { children?: ReactNode }) {
  return (
    <div className="md-tablewrap">
      <table className="md-table">{props.children}</table>
    </div>
  );
}

function Code(props: React.ComponentProps<"code"> & { inline?: boolean }) {
  const { inline, className, children, ...rest } = props;
  const value = childrenToText(children);
  const isInline = inline ?? (!className && !value.includes("\n"));

  if (isInline) {
    return <InlineCopyCode className="md-code" value={value} {...rest} />;
  }

  const language = /language-(\w+)/.exec(className ?? "")?.[1];
  return <CodeBlock language={language} value={value} />;
}

function CodeBlock(props: { language?: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="md-codeblock">
      <div className="md-codebar">
        <span className="md-codelang">{props.language ?? "code"}</span>
        <button
          className={`md-copy ${copied ? "is-copied" : ""}`}
          onClick={() => void handleCopy()}
          type="button"
        >
          <CopyGlyph />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="md-pre">
        <code>{props.value}</code>
      </pre>
    </div>
  );

  async function handleCopy() {
    await navigator.clipboard.writeText(props.value).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
}

function CopyGlyph() {
  return <Copy aria-hidden="true" size={13} />;
}

function InlineCopyCode(props: React.ComponentProps<"code"> & { value: string }) {
  const { value, className, ...rest } = props;
  const [copied, setCopied] = useState(false);

  return (
    <code
      {...rest}
      className={`${className ?? ""} cursor-pointer transition-colors ${copied ? "is-copied" : ""}`}
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
