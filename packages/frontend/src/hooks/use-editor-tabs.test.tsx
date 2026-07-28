import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
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

import {
  MAX_OPEN_TABS,
  parseTabsParam,
  serializeTabsParam,
  useEditorTabs,
  type EditorTab,
} from "./use-editor-tabs";

function wrapper(initial = ["/files"]) {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={initial}>{children}</MemoryRouter>
  );
}

const baseRevision = { mtimeMs: 1, sizeBytes: 5, sha256: "a".repeat(64) };

describe("serializeTabsParam / parseTabsParam", () => {
  it("round-trips encoded paths with special characters", () => {
    const tabs: EditorTab[] = [
      {
        key: "workspace:src/foo bar.ts",
        root: "workspace",
        path: "src/foo bar.ts",
        name: "foo bar.ts",
        loading: false,
        dirty: false,
      },
      {
        key: "host-filesystem:/etc/hosts",
        root: "host-filesystem",
        path: "/etc/hosts",
        name: "hosts",
        loading: false,
        dirty: false,
      },
    ];
    const round = parseTabsParam(serializeTabsParam(tabs));
    expect(round.map((tab) => tab.path)).toEqual(["src/foo bar.ts", "/etc/hosts"]);
    expect(round.map((tab) => tab.root)).toEqual(["workspace", "host-filesystem"]);
  });

  it("drops unknown roots and duplicate keys", () => {
    const parsed = parseTabsParam("workspace:a,unknown:b,workspace:a,workspace:c");
    expect(parsed.map((tab) => tab.path)).toEqual(["a", "c"]);
  });

  it("caps at MAX_OPEN_TABS", () => {
    const value = Array.from(
      { length: MAX_OPEN_TABS + 5 },
      (_, i) => `workspace:f${String(i)}`,
    ).join(",");
    expect(parseTabsParam(value)).toHaveLength(MAX_OPEN_TABS);
  });

  it("drops entries with invalid encoding or missing paths", () => {
    const parsed = parseTabsParam("workspace:%E0%A4%A,workspace:,");

    expect(parsed).toEqual([]);
  });
});

describe("useEditorTabs", () => {
  beforeEach(() => {
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

  it("opens a new tab and activates it", () => {
    const { result } = renderHook(() => useEditorTabs(), { wrapper: wrapper() });
    act(() => result.current.open({ root: "workspace", path: "a.ts" }));
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeKey).toBe("workspace:a.ts");
  });

  it("activates an already-open tab without duplicating it", () => {
    const { result } = renderHook(() => useEditorTabs(), { wrapper: wrapper() });
    act(() => result.current.open({ root: "workspace", path: "a.ts" }));
    act(() => result.current.open({ root: "workspace", path: "b.ts" }));
    act(() => result.current.open({ root: "workspace", path: "a.ts" }));
    expect(result.current.tabs.map((tab) => tab.path)).toEqual(["a.ts", "b.ts"]);
    expect(result.current.activeKey).toBe("workspace:a.ts");
  });

  it("closing the active tab activates its left neighbor", () => {
    const { result } = renderHook(() => useEditorTabs(), { wrapper: wrapper() });
    act(() => result.current.open({ root: "workspace", path: "a.ts" }));
    act(() => result.current.open({ root: "workspace", path: "b.ts" }));
    act(() => result.current.open({ root: "workspace", path: "c.ts" }));
    act(() => result.current.setActive("workspace:b.ts"));
    act(() => result.current.close("workspace:b.ts"));
    expect(result.current.activeKey).toBe("workspace:a.ts");
  });

  it("closing a non-active tab keeps the active one", () => {
    const { result } = renderHook(() => useEditorTabs(), { wrapper: wrapper() });
    act(() => result.current.open({ root: "workspace", path: "a.ts" }));
    act(() => result.current.open({ root: "workspace", path: "b.ts" }));
    act(() => result.current.close("workspace:a.ts"));
    expect(result.current.activeKey).toBe("workspace:b.ts");
  });

  it("closing a dirty tab prompts and respects cancel", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => useEditorTabs(), { wrapper: wrapper() });
    act(() => result.current.open({ root: "workspace", path: "a.ts" }));
    await vi.waitFor(() => expect(result.current.activeTab?.kind).toBe("text"));
    act(() => result.current.updateDraft("workspace:a.ts", "edited"));
    expect(result.current.activeTab?.dirty).toBe(true);
    act(() => result.current.close("workspace:a.ts"));
    expect(result.current.tabs).toHaveLength(1);
    confirm.mockReturnValue(true);
    act(() => result.current.close("workspace:a.ts"));
    expect(result.current.tabs).toHaveLength(0);
  });

  it("move reorders tabs", () => {
    const { result } = renderHook(() => useEditorTabs(), { wrapper: wrapper() });
    act(() => result.current.open({ root: "workspace", path: "a.ts" }));
    act(() => result.current.open({ root: "workspace", path: "b.ts" }));
    act(() => result.current.open({ root: "workspace", path: "c.ts" }));
    act(() => result.current.move(0, 2));
    expect(result.current.tabs.map((tab) => tab.path)).toEqual(["b.ts", "c.ts", "a.ts"]);
  });

  it("seeds tabs and active from URL search params on mount", async () => {
    const initial = `/files?tabs=workspace:a.ts,workspace:b.ts&active=workspace:b.ts`;
    const { result } = renderHook(() => useEditorTabs(), { wrapper: wrapper([initial]) });
    expect(result.current.tabs.map((tab) => tab.path)).toEqual(["a.ts", "b.ts"]);
    expect(result.current.activeKey).toBe("workspace:b.ts");
    await vi.waitFor(() => expect(result.current.activeTab?.kind).toBe("text"));
  });

  it("save updates baseline and clears dirty", async () => {
    vi.mocked(saveFileManagerFileContent).mockResolvedValue({
      path: "a.ts",
      revision: { mtimeMs: 999, sizeBytes: 10, sha256: "b".repeat(64) },
    });
    const { result } = renderHook(() => useEditorTabs(), { wrapper: wrapper() });
    act(() => result.current.open({ root: "workspace", path: "a.ts" }));
    await vi.waitFor(() => expect(result.current.activeTab?.kind).toBe("text"));
    act(() => result.current.updateDraft("workspace:a.ts", "next"));
    let outcome: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      outcome = await result.current.save("workspace:a.ts");
    });
    expect(outcome).toEqual({ ok: true });
    expect(result.current.activeTab?.dirty).toBe(false);
    expect(result.current.activeTab?.baseline).toBe("next");
  });
});
