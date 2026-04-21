import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

type MarkdownProps = { content: string };

export function Markdown({ content }: MarkdownProps) {
  return (
    <div className="prose prose-sm max-w-none text-text-primary [&_pre]:bg-surface [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:text-sm [&_code]:text-sm [&_code]:bg-surface [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_a]:text-accent [&_a]:underline [&_p]:leading-6 [&_li]:leading-6">
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{content}</ReactMarkdown>
    </div>
  );
}
