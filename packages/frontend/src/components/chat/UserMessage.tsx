import { memo } from "react";

import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";
import { FileText, Folder, Paperclip, Zap } from "lucide-react";

import { getMessageAttachments } from "./attachment-utils";
import { parseUserMessage } from "./user-message-utils";

type UserMessageProps = {
  message: ConversationMessage;
  parts: ConversationPart[];
  onAttachmentClick?: (filename: string) => void;
};

function UserMessageImpl({ message, parts, onAttachmentClick }: UserMessageProps) {
  const textPart = parts.find((p) => p.type === "text");
  const raw = (textPart?.["text"] as string) || message.content || "";
  const { skill, files, text } = parseUserMessage(raw);

  const attachments = getMessageAttachments(message.attachments ?? [], parts);
  const hasPills = skill || files.length > 0 || attachments.length > 0;

  return (
    <div className="bg-chat-user rounded-lg px-4 py-3 text-sm text-text-primary">
      {hasPills && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {skill && (
            <span className="inline-flex items-center gap-1 rounded-md bg-accent-surface px-2 py-0.5 text-xs font-medium text-accent">
              <Zap aria-hidden="true" className="h-3 w-3" />/{skill}
            </span>
          )}
          {files.map((f) => (
            <span
              key={f.path}
              className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent"
              title={f.path}
            >
              {f.isFolder ? (
                <Folder aria-hidden="true" className="h-3 w-3" />
              ) : (
                <FileText aria-hidden="true" className="h-3 w-3" />
              )}
              {f.display}
            </span>
          ))}
          {attachments.map((a, i) => (
            <button
              key={a.id ?? i}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-warning-surface px-2 py-0.5 text-xs font-medium text-warning-foreground transition hover:bg-warning/20"
              onClick={() => {
                if (a.filename) {
                  onAttachmentClick?.(a.filename);
                }
              }}
              title={a.mimeType}
              type="button"
            >
              <Paperclip aria-hidden="true" className="h-3 w-3" />
              {a.filename ?? "attachment"}
            </button>
          ))}
        </div>
      )}
      {text && <div className="whitespace-pre-wrap break-words">{text}</div>}
    </div>
  );
}

/** Memoized alongside AssistantMessage; see the note there. */
export const UserMessage = memo(UserMessageImpl);
