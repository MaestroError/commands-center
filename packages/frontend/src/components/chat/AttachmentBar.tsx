import type { SendConversationAttachmentInput } from "@cc/shared/schemas";
import { File, X } from "lucide-react";

interface AttachmentBarProps {
  attachments: SendConversationAttachmentInput[];
  onRemove: (index: number) => void;
}

export function AttachmentBar({ attachments, onRemove }: AttachmentBarProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 border-b border-[--border-primary] bg-[--bg-secondary] px-3 py-2">
      {attachments.map((attachment, index) => (
        <AttachmentPreview
          key={attachment.id ?? attachment.dataUrl.slice(0, 50)}
          attachment={attachment}
          onRemove={() => onRemove(index)}
        />
      ))}
    </div>
  );
}

function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: SendConversationAttachmentInput;
  onRemove: () => void;
}) {
  const isImage = attachment.mimeType.startsWith("image/");

  return (
    <div className="group relative flex items-center gap-2 rounded-md bg-[--bg-tertiary] p-1.5 pr-2">
      {isImage ? (
        <img
          src={attachment.dataUrl}
          alt={attachment.filename ?? "Attachment"}
          className="h-10 w-10 rounded object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded bg-[--bg-primary]">
          <File aria-hidden="true" className="h-5 w-5 text-[--text-secondary]" strokeWidth={1.5} />
        </div>
      )}
      <span className="max-w-32 truncate text-sm text-[--text-secondary]">
        {attachment.filename ?? "File"}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 rounded p-0.5 text-[--text-tertiary] hover:bg-[--bg-primary] hover:text-[--text-primary]"
        title="Remove attachment"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
