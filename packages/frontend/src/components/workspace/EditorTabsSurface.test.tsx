import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/context/use-theme", () => ({
  useTheme: () => ({ resolvedColorMode: "light" }),
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
    getFileManagerFileContent: vi.fn(),
    saveFileManagerFileContent: vi.fn(),
    FileSaveConflictError: FileSaveConflictErrorMock,
  };
});

import { getFileManagerFileContent, saveFileManagerFileContent } from "@/lib/api";

import { EditorTabsSurface } from "./EditorTabsSurface";
import { useEditorTabs } from "@/hooks/use-editor-tabs";

const baseRevision = { mtimeMs: 1, sizeBytes: 5, sha256: "a".repeat(64) };

function Harness(props: { initial?: { root: "workspace"; path: string }[] }) {
  const controller = useEditorTabs();
  return (
    <div>
      <button
        data-testid="open-a"
        onClick={() => controller.open({ root: "workspace", path: "a.ts" })}
        type="button"
      >
        open-a
      </button>
      <button
        data-testid="open-b"
        onClick={() => controller.open({ root: "workspace", path: "b.ts" })}
        type="button"
      >
        open-b
      </button>
      <EditorTabsSurface controller={controller} />
      <span data-testid="initial">{props.initial?.length ?? 0}</span>
    </div>
  );
}

describe("EditorTabsSurface", () => {
  beforeEach(() => {
    vi.mocked(getFileManagerFileContent).mockReset();
    vi.mocked(saveFileManagerFileContent).mockReset();
    vi.mocked(getFileManagerFileContent).mockImplementation(({ root, path }) =>
      Promise.resolve({
        root,
        path,
        absolutePath: `/abs/${path}`,
        name: path,
        kind: "text",
        content: `content-${path}`,
        revision: baseRevision,
        isWritable: true,
        mimeType: "text/plain",
      }),
    );
  });

  it("shows the empty state when no tabs are open", () => {
    render(
      <MemoryRouter initialEntries={["/files"]}>
        <Harness />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No file open/i)).toBeInTheDocument();
  });

  it("opens two files into separate tabs and switches between them", async () => {
    render(
      <MemoryRouter initialEntries={["/files"]}>
        <Harness />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("open-a"));
    fireEvent.click(screen.getByTestId("open-b"));

    await waitFor(() => expect(screen.getByLabelText("monaco-mock")).toHaveValue("content-b.ts"));
    expect(screen.getByTestId("editor-tab-workspace:a.ts")).toBeInTheDocument();
    expect(screen.getByTestId("editor-tab-workspace:b.ts")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("editor-tab-workspace:a.ts"));
    await waitFor(() => expect(screen.getByLabelText("monaco-mock")).toHaveValue("content-a.ts"));
  });

  it("preserves a tab's draft when switching away and back", async () => {
    render(
      <MemoryRouter initialEntries={["/files"]}>
        <Harness />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("open-a"));
    await waitFor(() => expect(screen.getByLabelText("monaco-mock")).toHaveValue("content-a.ts"));
    fireEvent.change(screen.getByLabelText("monaco-mock"), { target: { value: "draft-a" } });
    fireEvent.click(screen.getByTestId("open-b"));
    await waitFor(() => expect(screen.getByLabelText("monaco-mock")).toHaveValue("content-b.ts"));
    fireEvent.click(screen.getByTestId("editor-tab-workspace:a.ts"));
    await waitFor(() => expect(screen.getByLabelText("monaco-mock")).toHaveValue("draft-a"));
    expect(screen.getByTestId("editor-tab-dirty-workspace:a.ts")).toBeInTheDocument();
  });

  it("closes a clean tab without prompting", async () => {
    render(
      <MemoryRouter initialEntries={["/files"]}>
        <Harness />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("open-a"));
    await waitFor(() => expect(screen.getByLabelText("monaco-mock")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("editor-tab-close-workspace:a.ts"));
    await waitFor(() => expect(screen.getByText(/No file open/i)).toBeInTheDocument());
  });

  it("prompts before closing a dirty tab and respects cancel", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <MemoryRouter initialEntries={["/files"]}>
        <Harness />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("open-a"));
    await waitFor(() => expect(screen.getByLabelText("monaco-mock")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("monaco-mock"), { target: { value: "edited" } });
    fireEvent.click(screen.getByTestId("editor-tab-close-workspace:a.ts"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByTestId("editor-tab-workspace:a.ts")).toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByTestId("editor-tab-close-workspace:a.ts"));
    await waitFor(() => expect(screen.getByText(/No file open/i)).toBeInTheDocument());
  });

  it("saves and clears dirty state", async () => {
    vi.mocked(saveFileManagerFileContent).mockResolvedValue({
      path: "a.ts",
      revision: { mtimeMs: 2, sizeBytes: 6, sha256: "b".repeat(64) },
    });
    render(
      <MemoryRouter initialEntries={["/files"]}>
        <Harness />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("open-a"));
    await waitFor(() => expect(screen.getByLabelText("monaco-mock")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("monaco-mock"), { target: { value: "next" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveFileManagerFileContent).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByTestId("editor-tab-dirty-workspace:a.ts")).not.toBeInTheDocument(),
    );
  });

  it("cycles tabs with Ctrl+Tab and closes with Ctrl+W", async () => {
    render(
      <MemoryRouter initialEntries={["/files"]}>
        <Harness />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("open-a"));
    fireEvent.click(screen.getByTestId("open-b"));
    await waitFor(() =>
      expect(screen.getByTestId("editor-tab-workspace:b.ts")).toBeInTheDocument(),
    );

    fireEvent.keyDown(window, { key: "Tab", ctrlKey: true });
    await waitFor(() =>
      expect(screen.getByTestId("editor-tab-workspace:a.ts").getAttribute("aria-selected")).toBe(
        "true",
      ),
    );

    fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    await waitFor(() =>
      expect(screen.queryByTestId("editor-tab-workspace:a.ts")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("editor-tab-workspace:b.ts")).toBeInTheDocument();
  });
});
