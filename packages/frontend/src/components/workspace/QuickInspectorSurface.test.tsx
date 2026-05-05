import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuickInspectorSurface } from "./QuickInspectorSurface";

import type { FileManagerFileRevision, LiveRequest, SessionMediaItem } from "@cc/shared/schemas";
import type { UseChatInspectionTabs } from "@/hooks/use-chat-inspection-tabs";

vi.mock("./WorkspaceFileSurface", () => ({
  WorkspaceFileSurface: (props: {
    busy?: boolean;
    conflict?: { message: string };
    errorMessage?: string;
    file?: { name: string };
    onDiscardConflict?: () => void;
    onDraftChange?: (draft: string) => void;
    onReloadRequested?: () => void;
    onSaveRequested?: () => void;
  }) => (
    <div data-testid="workspace-file-surface">
      <span>{props.file?.name}</span>
      {props.busy ? <span>busy</span> : null}
      {props.conflict ? <span>{props.conflict.message}</span> : null}
      {props.errorMessage ? <span>{props.errorMessage}</span> : null}
      <button onClick={() => props.onSaveRequested?.()} type="button">
        Save file
      </button>
      <button onClick={() => props.onReloadRequested?.()} type="button">
        Reload file
      </button>
      <button onClick={() => props.onDraftChange?.("draft update")} type="button">
        Change draft
      </button>
      <button onClick={() => props.onDiscardConflict?.()} type="button">
        Dismiss conflict
      </button>
    </div>
  ),
}));

vi.mock("../live-requests/LiveRequestPane", () => ({
  LiveRequestPane: (props: {
    request: LiveRequest;
    onCancel?: (requestId: string, reason?: string) => Promise<void>;
    onResolve?: (
      requestId: string,
      action: string,
      values: Record<string, string>,
    ) => Promise<void>;
  }) => (
    <div data-testid="quick-inspector-live-request">
      <span>{props.request.presentation.title}</span>
      <button
        onClick={() => void props.onResolve?.(props.request.id, "submit", { slug: "value" })}
        type="button"
      >
        Resolve live request
      </button>
      <button
        onClick={() => void props.onCancel?.(props.request.id, "Cancelled by operator.")}
        type="button"
      >
        Cancel live request
      </button>
    </div>
  ),
}));

const revision: FileManagerFileRevision = {
  mtimeMs: 1,
  sizeBytes: 32,
  sha256: "a".repeat(64),
};

const fileTab = {
  key: "file:readme",
  name: "README.md",
  tabType: "file" as const,
  root: "workspace" as const,
  path: "README.md",
  displayPath: "README.md",
  loading: false,
  dirty: true,
  kind: "text" as const,
  isWritable: true,
  draft: "hello",
  baseline: "hello",
  revision,
};

const liveRequest: LiveRequest = {
  id: "request-1",
  conversationId: "conv-1",
  kind: "secret",
  presentation: {
    title: "Need secret",
    description: "Provide a secret",
    submitLabel: "Submit",
    cancelLabel: "Cancel",
  },
  fields: [],
  actions: [],
  metadata: {},
  closable: true,
  createdAt: "2026-05-05T10:00:00.000Z",
};

const mediaItem: SessionMediaItem = {
  id: "media-1",
  messageId: "msg-1",
  filename: "diagram.png",
  mime: "image/png",
  url: "https://example.com/diagram.png",
  createdAt: "2026-05-05T10:00:00.000Z",
};

function makeController(
  overrides: Partial<UseChatInspectionTabs> & {
    tabs?: UseChatInspectionTabs["tabs"];
    activeTab?: UseChatInspectionTabs["activeTab"];
  } = {},
): UseChatInspectionTabs {
  const tabs = overrides.tabs ?? [fileTab];
  return {
    tabs,
    activeKey: overrides.activeKey ?? tabs[0]?.key,
    activeTab: overrides.activeTab ?? tabs[0],
    open: true,
    openFile: vi.fn(),
    openMedia: vi.fn(),
    openLiveRequest: vi.fn(),
    removeLiveRequest: vi.fn(),
    close: vi.fn(),
    setActive: vi.fn(),
    setOpen: vi.fn(),
    updateDraft: vi.fn(),
    reload: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  } satisfies UseChatInspectionTabs;
}

describe("QuickInspectorSurface", () => {
  it("returns null when there is no active inspection", () => {
    const { container } = render(
      <QuickInspectorSurface
        controller={makeController({ tabs: [], activeKey: undefined, activeTab: undefined })}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("switches tabs, shows dirty indicators, and closes tabs without activating them", () => {
    const controller = makeController({
      tabs: [fileTab, { ...fileTab, key: "file:notes", name: "notes.md", path: "notes.md" }],
      activeKey: "file:readme",
      activeTab: fileTab,
    });

    render(<QuickInspectorSurface controller={controller} />);

    expect(screen.getByTestId("quick-inspector-dirty-file:readme")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("quick-inspector-tab-file:notes"));
    expect(controller.setActive).toHaveBeenCalledWith("file:notes");

    fireEvent.click(screen.getByTestId("quick-inspector-close-file:notes"));
    expect(controller.close).toHaveBeenCalledWith("file:notes");
    expect(controller.setActive).toHaveBeenCalledTimes(1);
  });

  it("wires file save, reload, draft, and conflict handling through the file pane", async () => {
    const controller = makeController({
      save: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, conflict: revision })
        .mockResolvedValueOnce({ ok: false, error: "Save failed" }),
    });

    render(<QuickInspectorSurface controller={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "Change draft" }));
    expect(controller.updateDraft).toHaveBeenCalledWith("file:readme", "draft update");

    fireEvent.click(screen.getByRole("button", { name: "Reload file" }));
    expect(controller.reload).toHaveBeenCalledWith("file:readme");

    fireEvent.click(screen.getByRole("button", { name: "Save file" }));
    expect(
      await screen.findByText("This file changed on disk since you opened it."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss conflict" }));
    await waitFor(() => {
      expect(
        screen.queryByText("This file changed on disk since you opened it."),
      ).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Save file" }));
    expect(await screen.findByText("Save failed")).toBeInTheDocument();
  });

  it("renders image, video, pdf, and fallback media previews", () => {
    const view = render(
      <QuickInspectorSurface
        controller={makeController({
          tabs: [
            {
              key: "media:image",
              name: "diagram.png",
              tabType: "media",
              dirty: false,
              item: mediaItem,
            },
          ],
          activeKey: "media:image",
          activeTab: {
            key: "media:image",
            name: "diagram.png",
            tabType: "media",
            dirty: false,
            item: mediaItem,
          },
        })}
      />,
    );

    expect(screen.getByRole("img", { name: "diagram.png" })).toBeInTheDocument();

    view.rerender(
      <QuickInspectorSurface
        controller={makeController({
          tabs: [
            {
              key: "media:video",
              name: "demo.mp4",
              tabType: "media",
              dirty: false,
              item: {
                ...mediaItem,
                filename: "demo.mp4",
                mime: "video/mp4",
                url: "https://example.com/demo.mp4",
              },
            },
          ],
          activeKey: "media:video",
          activeTab: {
            key: "media:video",
            name: "demo.mp4",
            tabType: "media",
            dirty: false,
            item: {
              ...mediaItem,
              filename: "demo.mp4",
              mime: "video/mp4",
              url: "https://example.com/demo.mp4",
            },
          },
        })}
      />,
    );

    expect(view.container.querySelector("video")).toBeInTheDocument();

    view.rerender(
      <QuickInspectorSurface
        controller={makeController({
          tabs: [
            {
              key: "media:pdf",
              name: "guide.pdf",
              tabType: "media",
              dirty: false,
              item: {
                ...mediaItem,
                filename: "guide.pdf",
                mime: "application/pdf",
                url: "https://example.com/guide.pdf",
              },
            },
          ],
          activeKey: "media:pdf",
          activeTab: {
            key: "media:pdf",
            name: "guide.pdf",
            tabType: "media",
            dirty: false,
            item: {
              ...mediaItem,
              filename: "guide.pdf",
              mime: "application/pdf",
              url: "https://example.com/guide.pdf",
            },
          },
        })}
      />,
    );

    expect(screen.getByTitle("guide.pdf")).toBeInTheDocument();

    view.rerender(
      <QuickInspectorSurface
        controller={makeController({
          tabs: [
            {
              key: "media:zip",
              name: "archive.zip",
              tabType: "media",
              dirty: false,
              item: {
                ...mediaItem,
                filename: "archive.zip",
                mime: "application/zip",
                url: "https://example.com/archive.zip",
              },
            },
          ],
          activeKey: "media:zip",
          activeTab: {
            key: "media:zip",
            name: "archive.zip",
            tabType: "media",
            dirty: false,
            item: {
              ...mediaItem,
              filename: "archive.zip",
              mime: "application/zip",
              url: "https://example.com/archive.zip",
            },
          },
        })}
      />,
    );

    expect(screen.getByText("This media type cannot be previewed inline.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in new tab" })).toHaveAttribute(
      "href",
      "https://example.com/archive.zip",
    );
  });

  it("renders the live request pane and forwards resolve and cancel handlers", async () => {
    const onResolveLiveRequest = vi.fn().mockResolvedValue(undefined);
    const onCancelLiveRequest = vi.fn().mockResolvedValue(undefined);

    render(
      <QuickInspectorSurface
        controller={makeController({
          tabs: [
            {
              key: "live-request:1",
              name: "Need secret",
              tabType: "live-request",
              dirty: false,
              closable: true,
              request: liveRequest,
            },
          ],
          activeKey: "live-request:1",
          activeTab: {
            key: "live-request:1",
            name: "Need secret",
            tabType: "live-request",
            dirty: false,
            closable: true,
            request: liveRequest,
          },
        })}
        onCancelLiveRequest={onCancelLiveRequest}
        onResolveLiveRequest={onResolveLiveRequest}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Resolve live request" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel live request" }));

    await waitFor(() => {
      expect(onResolveLiveRequest).toHaveBeenCalledWith("request-1", "submit", { slug: "value" });
      expect(onCancelLiveRequest).toHaveBeenCalledWith("request-1", "Cancelled by operator.");
    });
  });
});
