import { useEffect } from "react";

import type { SessionMediaItem } from "@cc/shared/schemas";

type ImageLightboxProps = {
  item: SessionMediaItem;
  onClose: () => void;
  onDownload: (item: SessionMediaItem) => void;
};

export function ImageLightbox({ item, onClose, onDownload }: ImageLightboxProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-label="Image preview"
      className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="cc-panel flex max-h-full w-full max-w-5xl flex-col gap-4 overflow-hidden p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">
              {item.filename ?? "Untitled"}
            </p>
            <p className="text-xs text-text-secondary">
              {new Date(item.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="cc-button cc-button-secondary"
              onClick={() => onDownload(item)}
              type="button"
            >
              Download
            </button>
            <button
              aria-label="Close preview"
              className="cc-button cc-button-secondary"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-surface-elevated/70 p-3">
          <img
            alt={item.filename ?? "Shared image"}
            className="mx-auto h-auto max-h-[75vh] max-w-full rounded-lg object-contain"
            src={item.url}
          />
        </div>
      </div>
    </div>
  );
}
