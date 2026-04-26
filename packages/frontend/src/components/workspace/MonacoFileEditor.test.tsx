import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MonacoFileEditor } from "./MonacoFileEditor";

vi.mock("@monaco-editor/react", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange?: (value: string | undefined) => void;
  }) => (
    <textarea
      aria-label="monaco-mock"
      onChange={(event) => onChange?.(event.target.value)}
      value={value}
    />
  ),
}));

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
    saveFileManagerFileContent: vi.fn(),
    FileSaveConflictError: FileSaveConflictErrorMock,
  };
});

import { FileSaveConflictError, saveFileManagerFileContent } from "@/lib/api";

const baseFile = {
  root: "workspace" as const,
  path: "doc.md",
  absolutePath: "/w/doc.md",
  name: "doc.md",
  kind: "text" as const,
  content: "v1",
  revision: { mtimeMs: 100, sizeBytes: 2, sha256: "a".repeat(64) },
  isWritable: true,
  mimeType: "text/markdown",
};

describe("MonacoFileEditor", () => {
  beforeEach(() => {
    vi.mocked(saveFileManagerFileContent).mockReset();
  });

  it("flags dirty state when the user edits content", async () => {
    const dirtySpy = vi.fn();
    render(
      <MonacoFileEditor
        file={baseFile}
        root="workspace"
        onDirtyChange={dirtySpy}
        onReloadRequested={() => {}}
        onSaved={() => {}}
      />,
    );

    fireEvent.change(await screen.findByLabelText("monaco-mock"), { target: { value: "v2" } });
    await waitFor(() => expect(dirtySpy).toHaveBeenLastCalledWith(true));
  });

  it("saves and clears dirty state when the save succeeds", async () => {
    vi.mocked(saveFileManagerFileContent).mockResolvedValue({
      path: "doc.md",
      revision: { mtimeMs: 200, sizeBytes: 4, sha256: "b".repeat(64) },
    });
    const dirtySpy = vi.fn();
    render(
      <MonacoFileEditor
        file={baseFile}
        root="workspace"
        onDirtyChange={dirtySpy}
        onReloadRequested={() => {}}
        onSaved={() => {}}
      />,
    );

    fireEvent.change(await screen.findByLabelText("monaco-mock"), { target: { value: "v2-x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveFileManagerFileContent).toHaveBeenCalled());
    await waitFor(() => expect(dirtySpy).toHaveBeenLastCalledWith(false));
  });

  it("surfaces a conflict banner with reload and overwrite actions", async () => {
    vi.mocked(saveFileManagerFileContent).mockRejectedValueOnce(
      new FileSaveConflictError("file changed on disk", {
        mtimeMs: 999,
        sizeBytes: 5,
        sha256: "c".repeat(64),
      }),
    );

    render(
      <MonacoFileEditor
        file={baseFile}
        root="workspace"
        onDirtyChange={() => {}}
        onReloadRequested={() => {}}
        onSaved={() => {}}
      />,
    );

    fireEvent.change(await screen.findByLabelText("monaco-mock"), { target: { value: "v2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/file changed on disk/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reload from disk/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Overwrite/i })).toBeInTheDocument();
  });

  it("retries with the current disk revision when the user picks overwrite", async () => {
    vi.mocked(saveFileManagerFileContent).mockRejectedValueOnce(
      new FileSaveConflictError("file changed on disk", {
        mtimeMs: 999,
        sizeBytes: 5,
        sha256: "c".repeat(64),
      }),
    );
    vi.mocked(saveFileManagerFileContent).mockResolvedValueOnce({
      path: "doc.md",
      revision: { mtimeMs: 1000, sizeBytes: 2, sha256: "d".repeat(64) },
    });

    render(
      <MonacoFileEditor
        file={baseFile}
        root="workspace"
        onDirtyChange={() => {}}
        onReloadRequested={() => {}}
        onSaved={() => {}}
      />,
    );

    fireEvent.change(await screen.findByLabelText("monaco-mock"), { target: { value: "v2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: /Overwrite/i });

    fireEvent.click(screen.getByRole("button", { name: /Overwrite/i }));

    await waitFor(() =>
      expect(vi.mocked(saveFileManagerFileContent).mock.calls.at(-1)?.[0]).toMatchObject({
        expectedRevision: expect.objectContaining({ sha256: "c".repeat(64) }),
      }),
    );
  });
});
