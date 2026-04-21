import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";

type UserMessageProps = {
  message: ConversationMessage;
  parts: ConversationPart[];
};

/** Parse skill reference, file mentions, and clean text from user message */
function parseUserMessage(raw: string) {
  let text = raw;
  let skill: string | null = null;
  const files: { path: string; display: string; isFolder: boolean }[] = [];

  // Extract skill: Use skill "slug".
  const skillMatch = text.match(/^Use skill "([^"]+)"\.\s*/);
  if (skillMatch) {
    skill = skillMatch[1] ?? null;
    text = text.slice(skillMatch[0].length);
  }

  // Extract #path references at the start
  const filePattern = /^#(\S+)\s*/;
  let match = filePattern.exec(text);
  while (match) {
    const path = match[1]!;
    const isFolder = path.endsWith("/");
    files.push({
      path,
      display: isFolder ? path : (path.split("/").pop() ?? path),
      isFolder,
    });
    text = text.slice(match[0].length);
    match = filePattern.exec(text);
  }

  return { skill, files, text: text.trim() };
}

export function UserMessage({ message, parts }: UserMessageProps) {
  const textPart = parts.find((p) => p.type === "text");
  const raw = (textPart?.["text"] as string) || message.content || "";
  const { skill, files, text } = parseUserMessage(raw);

  const attachments = message.attachments ?? [];
  const hasPills = skill || files.length > 0 || attachments.length > 0;

  return (
    <div className="bg-chat-user rounded-lg px-4 py-3 text-sm text-text-primary">
      {hasPills && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {skill && (
            <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/15 px-2 py-0.5 text-xs font-medium text-purple-400">
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              /{skill}
            </span>
          )}
          {files.map((f) => (
            <span
              key={f.path}
              className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent"
              title={f.path}
            >
              {f.isFolder ? (
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              )}
              {f.display}
            </span>
          ))}
          {attachments.map((a, i) => (
            <span
              key={a.id ?? i}
              className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500"
              title={a.mimeType}
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
                />
              </svg>
              {a.filename ?? "attachment"}
            </span>
          ))}
        </div>
      )}
      {text && <div className="whitespace-pre-wrap">{text}</div>}
    </div>
  );
}
