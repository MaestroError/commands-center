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

import { useQuickFile } from "./use-quick-file";

const baseRevision = { mtimeMs: 1, sizeBytes: 5, sha256: "a".repeat(64) };

describe("useQuickFile", () => {
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

  it("opens and loads a single file", async () => {
    const { result } = renderHook(() => useQuickFile());

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/planner/README.md" });
    });

    expect(result.current.file?.path).toBe("agents/planner/README.md");
    expect(result.current.file?.draft).toBe("content of agents/planner/README.md");
  });

  it("prompts before closing a dirty file and respects cancel", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => useQuickFile());

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/planner/README.md" });
    });

    act(() => {
      result.current.updateDraft("edited");
    });

    let closed = false;
    act(() => {
      closed = result.current.close();
    });
    expect(closed).toBe(false);
    expect(confirmSpy).toHaveBeenCalled();
    expect(result.current.file).toBeDefined();

    confirmSpy.mockReturnValue(true);
    act(() => {
      closed = result.current.close();
    });
    expect(closed).toBe(true);
    expect(result.current.file).toBeUndefined();
  });

  it("saves and clears dirty state", async () => {
    vi.mocked(saveFileManagerFileContent).mockResolvedValue({
      path: "agents/planner/README.md",
      revision: { mtimeMs: 2, sizeBytes: 6, sha256: "b".repeat(64) },
    });

    const { result } = renderHook(() => useQuickFile());

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/planner/README.md" });
    });

    act(() => {
      result.current.updateDraft("next");
    });

    await act(async () => {
      await result.current.save();
    });

    expect(saveFileManagerFileContent).toHaveBeenCalledWith({
      root: "workspace",
      path: "agents/planner/README.md",
      content: "next",
      expectedRevision: baseRevision,
    });
    expect(result.current.file?.dirty).toBe(false);
    expect(result.current.file?.baseline).toBe("next");
  });
});
