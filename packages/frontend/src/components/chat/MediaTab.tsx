import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchConversationMedia } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import { ImageLightbox } from "./ImageLightbox";

import type { SessionMediaItem } from "@cc/shared/schemas";

type MediaTabProps = {
  conversationId: string;
};

type GroupedMedia = {
  images: SessionMediaItem[];
  documents: SessionMediaItem[];
  other: SessionMediaItem[];
};

export function MediaTab({ conversationId }: MediaTabProps) {
  const [selectedImage, setSelectedImage] = useState<SessionMediaItem | null>(null);
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.conversationMedia(conversationId),
    queryFn: () => fetchConversationMedia(conversationId),
    enabled: conversationId.length > 0,
  });

  const grouped = useMemo<GroupedMedia>(() => {
    return data.reduce<GroupedMedia>(
      (acc, item) => {
        if (item.mime.startsWith("image/")) {
          acc.images.push(item);
        } else if (isDocumentMime(item.mime)) {
          acc.documents.push(item);
        } else {
          acc.other.push(item);
        }

        return acc;
      },
      { images: [], documents: [], other: [] },
    );
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-text-secondary">
        Loading media...
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-10 text-center text-sm text-danger">
        {error instanceof Error ? error.message : "Failed to load media."}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-text-secondary">
        No media shared in this conversation
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {grouped.images.length > 0 ? (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
              Images
            </h3>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {grouped.images.map((item) => (
                <div
                  key={item.id}
                  className="relative overflow-hidden rounded-xl border border-border bg-surface transition hover:border-accent/50 hover:bg-surface-elevated"
                >
                  <button
                    aria-label={`Download ${item.filename ?? "image"}`}
                    className="absolute right-2 top-2 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-border/80 bg-app-bg/90 text-text-secondary shadow-sm backdrop-blur-sm transition hover:border-accent/50 hover:text-text-primary"
                    onClick={(event) => {
                      event.stopPropagation();
                      void downloadMediaItem(item);
                    }}
                    type="button"
                  >
                    <DownloadIcon />
                  </button>
                  <button
                    aria-label={`Preview ${item.filename ?? "image"}`}
                    className="block w-full text-left"
                    onClick={() => setSelectedImage(item)}
                    type="button"
                  >
                    <img
                      alt={item.filename ?? "Shared image"}
                      className="aspect-square w-full bg-surface-elevated object-cover"
                      src={item.url}
                    />
                    <div className="space-y-1 p-2.5">
                      <p className="truncate text-xs font-medium text-text-primary">
                        {item.filename ?? "Untitled"}
                      </p>
                      <p className="text-[11px] text-text-secondary">
                        {formatTimestamp(item.createdAt)}
                      </p>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {grouped.documents.length > 0 ? (
          <MediaListSection items={grouped.documents} title="Documents" />
        ) : null}

        {grouped.other.length > 0 ? (
          <MediaListSection items={grouped.other} title="Other files" />
        ) : null}
      </div>

      {selectedImage ? (
        <ImageLightbox
          item={selectedImage}
          onClose={() => setSelectedImage(null)}
          onDownload={(item) => {
            void downloadMediaItem(item);
          }}
        />
      ) : null}
    </>
  );
}

function MediaListSection(props: { title: string; items: SessionMediaItem[] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
        {props.title}
      </h3>
      <div className="space-y-2">
        {props.items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-text-secondary">
              <FileIcon />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">
                {item.filename ?? "Untitled"}
              </p>
              <p className="truncate text-xs text-text-secondary">
                {item.mime} · {formatTimestamp(item.createdAt)}
              </p>
            </div>
            <a
              aria-label={`Open ${item.filename ?? "file"}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
              href={item.url}
              rel="noreferrer"
              target="_blank"
            >
              <OpenIcon />
            </a>
            <button
              aria-label={`Download ${item.filename ?? "file"}`}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface-elevated text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
              onClick={() => {
                void downloadMediaItem(item);
              }}
              type="button"
            >
              <DownloadIcon />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function FileIcon() {
  return (
    <svg fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M14 3v5h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M9 13h6M9 17h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path
        d="M14 5h5v5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M10 14 19 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path
        d="M12 4v10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="m8 10 4 4 4-4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M5 19h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function isDocumentMime(mime: string): boolean {
  return (
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime === "application/msword" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-powerpoint" ||
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  );
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

async function downloadMediaItem(item: SessionMediaItem): Promise<void> {
  const filename = item.filename ?? "download";

  try {
    const response = await fetch(item.url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, filename);
    URL.revokeObjectURL(objectUrl);
    return;
  } catch {
    triggerDownload(item.url, filename);
  }
}

function triggerDownload(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}
