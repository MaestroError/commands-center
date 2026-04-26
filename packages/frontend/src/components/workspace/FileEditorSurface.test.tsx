import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileEditorSurface } from "./FileEditorSurface";

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

vi.mock("@/lib/api", () => ({
  getFileManagerFileContent: vi.fn(),
  saveFileManagerFileContent: vi.fn(),
  FileSaveConflictError: class extends Error {
    currentRevision?: unknown;
    constructor(message: string, currentRevision?: unknown) {
      super(message);
      this.currentRevision = currentRevision;
    }
  },
}));

import { getFileManagerFileContent, saveFileManagerFileContent } from "@/lib/api";

const baseRevision = { mtimeMs: 1000, sizeBytes: 5, sha256: "a".repeat(64) };

describe("FileEditorSurface", () => {
  beforeEach(() => {
    vi.mocked(getFileManagerFileContent).mockReset();
    vi.mocked(saveFileManagerFileContent).mockReset();
  });

  it("renders the empty state when no file is open", () => {
    render(<FileEditorSurface opened={undefined} reloadKey={0} onDirtyChange={() => {}} />);
    expect(screen.getByText(/No file open/i)).toBeInTheDocument();
  });

  it("loads and renders text content with the Monaco mock", async () => {
    vi.mocked(getFileManagerFileContent).mockResolvedValue({
      root: "workspace",
      path: "doc.md",
      absolutePath: "/w/doc.md",
      name: "doc.md",
      kind: "text",
      content: "# title",
      revision: baseRevision,
      isWritable: true,
      mimeType: "text/markdown",
    });

    render(
      <FileEditorSurface
        opened={{ root: "workspace", path: "doc.md" }}
        reloadKey={0}
        onDirtyChange={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("monaco-mock")).toBeInTheDocument());
    expect(screen.getByLabelText("monaco-mock")).toHaveValue("# title");
  });

  it("renders an image preview for image mime types", async () => {
    vi.mocked(getFileManagerFileContent).mockResolvedValue({
      root: "workspace",
      path: "logo.png",
      absolutePath: "/w/logo.png",
      name: "logo.png",
      kind: "binary",
      content: "AAAA",
      encoding: "base64",
      mimeType: "image/png",
      revision: baseRevision,
      isWritable: true,
    });

    render(
      <FileEditorSurface
        opened={{ root: "workspace", path: "logo.png" }}
        reloadKey={0}
        onDirtyChange={() => {}}
      />,
    );

    const image = await screen.findByRole("img", { name: "logo.png" });
    expect(image).toHaveAttribute("src", "data:image/png;base64,AAAA");
  });

  it("renders a fallback card for unsupported binary files", async () => {
    vi.mocked(getFileManagerFileContent).mockResolvedValue({
      root: "workspace",
      path: "archive.zip",
      absolutePath: "/w/archive.zip",
      name: "archive.zip",
      kind: "binary",
      content: "AAAA",
      encoding: "base64",
      mimeType: "application/zip",
      revision: baseRevision,
      isWritable: true,
    });

    render(
      <FileEditorSurface
        opened={{ root: "workspace", path: "archive.zip" }}
        reloadKey={0}
        onDirtyChange={() => {}}
      />,
    );

    expect(await screen.findByText(/not editable in-app/i)).toBeInTheDocument();
  });

  it("renders a too-large card above the editor cap", async () => {
    vi.mocked(getFileManagerFileContent).mockResolvedValue({
      root: "workspace",
      path: "big.bin",
      absolutePath: "/w/big.bin",
      name: "big.bin",
      kind: "too-large",
      content: "",
      revision: { mtimeMs: 1, sizeBytes: 5_000_000, sha256: "x" },
      isWritable: true,
    });

    render(
      <FileEditorSurface
        opened={{ root: "workspace", path: "big.bin" }}
        reloadKey={0}
        onDirtyChange={() => {}}
      />,
    );

    expect(await screen.findByText(/2 MB editor limit/i)).toBeInTheDocument();
  });

  it("shows a read-only banner when the root is not writable", async () => {
    vi.mocked(getFileManagerFileContent).mockResolvedValue({
      root: "host-filesystem",
      path: "/etc/hosts",
      absolutePath: "/etc/hosts",
      name: "hosts",
      kind: "text",
      content: "127.0.0.1 localhost",
      revision: baseRevision,
      isWritable: false,
      mimeType: "text/plain",
    });

    render(
      <FileEditorSurface
        opened={{ root: "host-filesystem", path: "/etc/hosts" }}
        reloadKey={0}
        onDirtyChange={() => {}}
      />,
    );

    expect(await screen.findByText(/read-only/i)).toBeInTheDocument();
  });
});
