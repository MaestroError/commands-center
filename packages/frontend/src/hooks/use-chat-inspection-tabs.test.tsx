import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => {
  class FileSaveConflictErrorMock extends Error {
    currentRevision?: unknown;

    constructor(message: string, currentRevision?: unknown) {
      super(message);
      this.name = "FileSaveConflictError";
      this.currentRevision = currentRevision;
    }
  }

  return {
    getFileManagerFileContent: vi.fn(),
    saveFileManagerFileContent: vi.fn(),
    FileSaveConflictError: FileSaveConflictErrorMock,
  };
});

import { getFileManagerFileContent, saveFileManagerFileContent } from "@/lib/api";

import { useChatInspectionTabs } from "./use-chat-inspection-tabs";

const baseRevision = { mtimeMs: 1, sizeBytes: 5, sha256: "a".repeat(64) };

describe("useChatInspectionTabs", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(getFileManagerFileContent).mockReset();
    vi.mocked(saveFileManagerFileContent).mockReset();
    vi.mocked(getFileManagerFileContent).mockImplementation(({ root, path }) =>
      Promise.resolve({
        root,
        path,
        absolutePath: `/abs/${path}`,
        name: path.split("/").pop() ?? path,
        kind: "text",
        content: `content of ${path}`,
        revision: baseRevision,
        isWritable: true,
        mimeType: "text/plain",
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a file tab and a media tab and keeps the latest one active", async () => {
    const { result } = renderHook(() => useChatInspectionTabs("conv-1"));

    await act(async () => {
      result.current.openFile({ root: "workspace", path: "agents/planner/README.md" });
      result.current.openMedia({
        id: "img-1",
        messageId: "msg-1",
        filename: "diagram.png",
        mime: "image/png",
        url: "data:image/png;base64,AAAA",
        createdAt: "2026-05-02T10:00:00.000Z",
      });
      await Promise.resolve();
    });

    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.activeKey).toBe("media:img-1");
    expect(result.current.open).toBe(true);
  });

  it("opens a non-closable live request tab and removes it by request id", () => {
    const { result } = renderHook(() => useChatInspectionTabs("conv-1"));

    act(() => {
      result.current.openLiveRequest({
        id: "req-1",
        conversationId: "conv-1",
        kind: "add_secret",
        closable: false,
        metadata: {},
        createdAt: "2026-05-02T10:00:00.000Z",
        presentation: {
          title: "Add GitHub token",
          description: "Enter the token while the agent waits.",
          submitLabel: "Store token",
          cancelLabel: "Cancel",
        },
        fields: [
          { type: "text", name: "key", label: "Secret key", required: true },
          { type: "password", name: "value", label: "Secret value", required: true },
        ],
      });
    });

    expect(result.current.activeKey).toBe("live-request:req-1");
    expect(result.current.activeTab?.tabType).toBe("live-request");

    act(() => {
      result.current.close("live-request:req-1");
    });

    expect(result.current.tabs).toHaveLength(1);

    act(() => {
      result.current.removeLiveRequest("req-1");
    });

    expect(result.current.tabs).toHaveLength(0);
  });

  it("restores open tabs and active tab from session storage for the same conversation", async () => {
    const { result, unmount } = renderHook(() => useChatInspectionTabs("conv-1"));

    await act(async () => {
      result.current.openFile({ root: "workspace", path: "agents/planner/README.md" });
      result.current.openMedia({
        id: "img-1",
        messageId: "msg-1",
        filename: "diagram.png",
        mime: "image/png",
        url: "data:image/png;base64,AAAA",
        createdAt: "2026-05-02T10:00:00.000Z",
      });
      result.current.setActive("file:workspace:agents/planner/README.md");
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(result.current.activeTab?.tabType).toBe("file"));
    act(() => {
      unmount();
    });

    const restored = renderHook(() => useChatInspectionTabs("conv-1"));

    await act(async () => {});

    expect(restored.result.current.tabs).toHaveLength(2);
    expect(restored.result.current.activeKey).toBe("file:workspace:agents/planner/README.md");
    expect(restored.result.current.open).toBe(true);
  });

  it("keeps independent state per conversation when switching between sessions", async () => {
    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId?: string }) => useChatInspectionTabs(conversationId),
      { initialProps: { conversationId: "conv-1" } },
    );

    await act(async () => {
      result.current.openFile({ root: "workspace", path: "agents/planner/README.md" });
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(result.current.tabs).toHaveLength(1));

    act(() => {
      rerender({ conversationId: "conv-2" });
    });

    expect(result.current.tabs).toHaveLength(0);
    expect(result.current.open).toBe(false);

    act(() => {
      result.current.openMedia({
        id: "img-2",
        messageId: "msg-2",
        filename: "wireframe.png",
        mime: "image/png",
        url: "data:image/png;base64,BBBB",
        createdAt: "2026-05-02T11:00:00.000Z",
      });
    });

    expect(result.current.activeKey).toBe("media:img-2");

    act(() => {
      rerender({ conversationId: "conv-1" });
    });

    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeKey).toBe("file:workspace:agents/planner/README.md");
  });

  it("saves a dirty file tab and clears its dirty state", async () => {
    vi.mocked(saveFileManagerFileContent).mockResolvedValue({
      path: "agents/planner/README.md",
      revision: { mtimeMs: 2, sizeBytes: 6, sha256: "b".repeat(64) },
    });

    const { result } = renderHook(() => useChatInspectionTabs("conv-1"));

    await act(async () => {
      result.current.openFile({ root: "workspace", path: "agents/planner/README.md" });
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(result.current.activeTab?.tabType).toBe("file"));

    act(() => {
      result.current.updateDraft("file:workspace:agents/planner/README.md", "next");
    });

    let outcome: Awaited<ReturnType<typeof result.current.save>> | undefined;

    await act(async () => {
      outcome = await result.current.save("file:workspace:agents/planner/README.md");
    });

    expect(outcome).toEqual({ ok: true });
    expect(result.current.activeTab?.tabType).toBe("file");
    if (result.current.activeTab?.tabType === "file") {
      expect(result.current.activeTab.dirty).toBe(false);
      expect(result.current.activeTab.baseline).toBe("next");
    }
  });
});
