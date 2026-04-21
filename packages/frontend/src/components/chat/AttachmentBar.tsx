import type { SendConversationAttachmentInput } from "@cc/shared/schemas";

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
          <svg
            className="h-5 w-5 text-[--text-secondary]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
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
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
