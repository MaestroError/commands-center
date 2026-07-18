import type { SessionMediaItem } from "@cc/shared/schemas";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ImageLightboxProps = {
  item: SessionMediaItem;
  onClose: () => void;
  onDownload: (item: SessionMediaItem) => void;
};

export function ImageLightbox({ item, onClose, onDownload }: ImageLightboxProps) {
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-5xl gap-4 overflow-hidden p-4">
        <DialogTitle className="sr-only">Image preview</DialogTitle>
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
            <Button variant="secondary" onClick={() => onDownload(item)} type="button">
              Download
            </Button>
            <Button variant="secondary" aria-label="Close preview" onClick={onClose} type="button">
              Close
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-surface-elevated/70 p-3">
          <img
            alt={item.filename ?? "Shared image"}
            className="mx-auto h-auto max-h-[75vh] max-w-full rounded-lg object-contain"
            src={item.url}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
