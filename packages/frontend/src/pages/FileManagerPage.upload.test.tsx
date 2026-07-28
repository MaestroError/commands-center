import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileManagerPage } from "./FileManagerPage";
import { listFileManagerNodes, uploadFileManagerEntries } from "@/lib/api";

// Capture the onDrop passed to useDropzone so tests can drive uploads directly.
let capturedOnDrop: ((files: File[]) => void) | undefined;
const dropzoneOpen = vi.fn();

vi.mock("react-dropzone", () => ({
  useDropzone: (config: { onDrop: (files: File[]) => void }) => {
    capturedOnDrop = config.onDrop;
    return {
      getRootProps: () => ({}),
      getInputProps: () => ({}),
      isDragActive: false,
      open: dropzoneOpen,
    };
  },
}));

vi.mock("@/lib/api", () => ({
  listFileManagerNodes: vi.fn(),
  createFileManagerEntry: vi.fn(),
  renameFileManagerEntry: vi.fn(),
  moveFileManagerEntry: vi.fn(),
  searchFileManagerDirectories: vi.fn(),
  deleteFileManagerEntry: vi.fn(),
  getFileManagerFileContent: vi.fn(),
  saveFileManagerFileContent: vi.fn(),
  uploadFileManagerEntries: vi.fn(),
  FileSaveConflictError: class extends Error {},
}));

vi.mock("@monaco-editor/react", () => ({
  default: () => <textarea aria-label="monaco-mock" />,
}));

vi.mock("@/context/use-theme", () => ({
  useTheme: () => ({ resolvedColorMode: "light" }),
}));

function makeFile(content: string, name: string): File {
  const file = new File([content], name, { type: "text/plain" });
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(new TextEncoder().encode(content).buffer),
  });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnDrop = undefined;
  dropzoneOpen.mockReset();
  vi.mocked(listFileManagerNodes).mockResolvedValue({
    root: "workspace",
    currentPath: ".",
    absolutePath: "/tmp/.cc/workspace",
    sizeBytes: 4096,
    lineCount: undefined,
    nodes: [
      {
        name: "src",
        path: "src",
        absolutePath: "/tmp/.cc/workspace/src",
        type: "directory",
        sizeBytes: 2048,
        isCritical: false,
      },
    ],
  });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/files?root=workspace&path=."]}>
      <FileManagerPage />
    </MemoryRouter>,
  );
}

async function openUploadPanel() {
  renderPage();
  await screen.findByRole("button", { name: "src" });
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  return screen.findByTestId("file-manager-upload-panel");
}

describe("FileManagerPage upload panel", () => {
  it("uploads dropped files and surfaces rejected entries", async () => {
    vi.mocked(uploadFileManagerEntries).mockResolvedValue({
      uploaded: [{ name: "ok.txt", relativePath: "ok.txt", path: "ok.txt" }],
      rejected: [{ name: "bad.exe", relativePath: "bad.exe", reason: "blocked" }],
    });

    await openUploadPanel();

    await act(async () => {
      capturedOnDrop?.([makeFile("hello", "ok.txt")]);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(uploadFileManagerEntries).toHaveBeenCalledWith(
        expect.objectContaining({ root: "workspace", destinationPath: "." }),
      );
    });
    expect(await screen.findByText("bad.exe: blocked")).toBeInTheDocument();
  });

  it("shows an error message when the upload request fails", async () => {
    vi.mocked(uploadFileManagerEntries).mockRejectedValue(new Error("upload exploded"));

    await openUploadPanel();

    await act(async () => {
      capturedOnDrop?.([makeFile("hi", "note.txt")]);
      await Promise.resolve();
    });

    expect((await screen.findAllByText("upload exploded")).length).toBeGreaterThan(0);
  });

  it("ignores an empty drop", async () => {
    await openUploadPanel();

    await act(async () => {
      capturedOnDrop?.([]);
      await Promise.resolve();
    });

    expect(uploadFileManagerEntries).not.toHaveBeenCalled();
  });

  it("opens the file picker from the Files button and the folder input from the Folder button", async () => {
    await openUploadPanel();

    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    expect(dropzoneOpen).toHaveBeenCalled();

    // Folder button switches mode and clicks the hidden folder input without error.
    fireEvent.click(screen.getByRole("button", { name: "Folder" }));
    expect(screen.getByTestId("file-manager-upload-panel")).toBeInTheDocument();
  });
});
