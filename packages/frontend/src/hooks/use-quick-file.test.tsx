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

import {
  FileSaveConflictError,
  getFileManagerFileContent,
  saveFileManagerFileContent,
} from "@/lib/api";

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

  it("reloads the same clean file without prompting", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const { result } = renderHook(() => useQuickFile());

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/planner/README.md" });
    });

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/planner/README.md" });
    });

    expect(getFileManagerFileContent).toHaveBeenCalledTimes(2);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("prompts before opening a different file when the current file is dirty", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => useQuickFile());

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/planner/README.md" });
    });

    act(() => {
      result.current.updateDraft("edited");
    });

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/writer/notes.md" });
    });

    expect(confirmSpy).toHaveBeenCalledWith("Discard unsaved changes to README.md?");
    expect(result.current.file?.path).toBe("agents/planner/README.md");

    confirmSpy.mockReturnValue(true);

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/writer/notes.md" });
    });

    expect(result.current.file?.path).toBe("agents/writer/notes.md");
  });

  it("stores fallback errors when loading a file fails", async () => {
    vi.mocked(getFileManagerFileContent).mockRejectedValueOnce("failed");
    const { result } = renderHook(() => useQuickFile());

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/planner/README.md" });
    });

    expect(result.current.file).toMatchObject({
      path: "agents/planner/README.md",
      loading: false,
      error: "Failed to load file.",
    });
  });

  it("captures save conflicts and clears them on reload", async () => {
    const currentRevision = { mtimeMs: 2, sizeBytes: 8, sha256: "b".repeat(64) };
    vi.mocked(saveFileManagerFileContent).mockRejectedValueOnce(
      new FileSaveConflictError("conflict", currentRevision),
    );
    const { result } = renderHook(() => useQuickFile());

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/planner/README.md" });
    });

    act(() => {
      result.current.updateDraft("edited");
    });

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.conflict).toEqual({
      currentRevision,
      message: "This file changed on disk since you opened it.",
    });

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.conflict).toBeUndefined();
    expect(result.current.file?.draft).toBe("content of agents/planner/README.md");
  });

  it("uses override revisions and reports generic save failures", async () => {
    const overrideRevision = { mtimeMs: 3, sizeBytes: 9, sha256: "c".repeat(64) };
    vi.mocked(saveFileManagerFileContent).mockRejectedValueOnce(new Error("save failed"));
    const { result } = renderHook(() => useQuickFile());

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/planner/README.md" });
    });

    act(() => {
      result.current.updateDraft("edited again");
    });

    await act(async () => {
      await result.current.save(overrideRevision);
    });

    expect(saveFileManagerFileContent).toHaveBeenLastCalledWith({
      root: "workspace",
      path: "agents/planner/README.md",
      content: "edited again",
      expectedRevision: overrideRevision,
    });
    expect(result.current.errorMessage).toBe("save failed");
  });

  it("keeps binary files unchanged when updating drafts and skips saving without a text revision", async () => {
    vi.mocked(getFileManagerFileContent).mockResolvedValueOnce({
      root: "workspace",
      path: "agents/planner/image.png",
      absolutePath: "/abs/agents/planner/image.png",
      name: "image.png",
      kind: "binary",
      content: "ZmFrZQ==",
      revision: baseRevision,
      isWritable: true,
      mimeType: "image/png",
    });
    const { result } = renderHook(() => useQuickFile());

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/planner/image.png" });
    });

    act(() => {
      result.current.updateDraft("ignored");
    });

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.file).toMatchObject({
      path: "agents/planner/image.png",
      kind: "binary",
      dirty: false,
      binaryContentBase64: "ZmFrZQ==",
    });
    expect(saveFileManagerFileContent).toHaveBeenCalledTimes(0);
  });

  it("skips reload and save when no file is open", async () => {
    const { result } = renderHook(() => useQuickFile());

    await act(async () => {
      await result.current.reload();
      await result.current.save();
    });

    expect(getFileManagerFileContent).not.toHaveBeenCalled();
    expect(saveFileManagerFileContent).not.toHaveBeenCalled();
  });

  it("stores the fallback message when saving fails with a non-error value", async () => {
    vi.mocked(saveFileManagerFileContent).mockRejectedValueOnce("failed");
    const { result } = renderHook(() => useQuickFile());

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/planner/README.md" });
    });

    act(() => {
      result.current.updateDraft("edited again");
    });

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.errorMessage).toBe("Failed to save file.");
  });

  it("closes a clean file without prompting", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const { result } = renderHook(() => useQuickFile());

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/planner/README.md" });
    });

    let closed = false;
    act(() => {
      closed = result.current.close();
    });

    expect(closed).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("keeps the newly opened file when an older save resolves late", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    let resolveSave: ((value: { path: string; revision: typeof baseRevision }) => void) | undefined;

    vi.mocked(saveFileManagerFileContent).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    const { result } = renderHook(() => useQuickFile());

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/planner/README.md" });
    });

    act(() => {
      result.current.updateDraft("edited once");
      void result.current.save();
    });

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/writer/notes.md" });
    });

    resolveSave?.({
      path: "agents/planner/README.md",
      revision: { mtimeMs: 2, sizeBytes: 10, sha256: "d".repeat(64) },
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalledWith("Discard unsaved changes to README.md?");
    expect(result.current.file?.path).toBe("agents/writer/notes.md");
    expect(result.current.file?.baseline).toBe("content of agents/writer/notes.md");
  });

  it("ignores an older file load that resolves after a newer open request", async () => {
    let resolveFirst:
      | ((value: Awaited<ReturnType<typeof getFileManagerFileContent>>) => void)
      | undefined;

    vi.mocked(getFileManagerFileContent)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(({ root, path }) =>
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

    const { result } = renderHook(() => useQuickFile());

    act(() => {
      void result.current.open({ root: "workspace", path: "agents/planner/README.md" });
    });

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/writer/notes.md" });
    });

    resolveFirst?.({
      root: "workspace",
      path: "agents/planner/README.md",
      absolutePath: "/abs/agents/planner/README.md",
      name: "README.md",
      kind: "text",
      content: "stale content",
      revision: baseRevision,
      isWritable: true,
      mimeType: "text/plain",
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.file?.path).toBe("agents/writer/notes.md");
    expect(result.current.file?.baseline).toBe("content of agents/writer/notes.md");
  });

  it("ignores an older file load failure after a newer open request", async () => {
    let rejectFirst: ((reason?: unknown) => void) | undefined;

    vi.mocked(getFileManagerFileContent)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockImplementationOnce(({ root, path }) =>
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

    const { result } = renderHook(() => useQuickFile());

    act(() => {
      void result.current.open({ root: "workspace", path: "agents/planner/README.md" });
    });

    await act(async () => {
      await result.current.open({ root: "workspace", path: "agents/writer/notes.md" });
    });

    rejectFirst?.(new Error("stale failure"));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.file?.path).toBe("agents/writer/notes.md");
    expect(result.current.file?.error).toBeUndefined();
  });
});
