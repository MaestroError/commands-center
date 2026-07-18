import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileManagerPage } from "./FileManagerPage";

import {
  createFileManagerEntry,
  deleteFileManagerEntry,
  getFileManagerFileContent,
  listFileManagerNodes,
  moveFileManagerEntry,
  renameFileManagerEntry,
  searchFileManagerDirectories,
} from "@/lib/api";

vi.mock("@/lib/api", () => ({
  listFileManagerNodes: vi.fn(),
  createFileManagerEntry: vi.fn(),
  renameFileManagerEntry: vi.fn(),
  moveFileManagerEntry: vi.fn(),
  searchFileManagerDirectories: vi.fn(),
  deleteFileManagerEntry: vi.fn(),
  downloadFileManagerFile: vi.fn(),
  downloadFileManagerFolderZip: vi.fn(),
  getFileManagerFileContent: vi.fn(),
  saveFileManagerFileContent: vi.fn(),
  FileSaveConflictError: class extends Error {
    currentRevision?: unknown;
  },
}));

vi.mock("react-dropzone", () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
    open: vi.fn(),
  }),
}));

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

describe("FileManagerPage", () => {
  const confirmSpy = vi.spyOn(window, "confirm");
  const writeTextSpy = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    confirmSpy.mockReset();
    confirmSpy.mockReturnValue(true);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextSpy,
      },
    });
    writeTextSpy.mockReset();
    vi.mocked(createFileManagerEntry).mockReset();
    vi.mocked(deleteFileManagerEntry).mockReset();
    vi.mocked(renameFileManagerEntry).mockReset();
    vi.mocked(moveFileManagerEntry).mockReset();
    vi.mocked(searchFileManagerDirectories).mockReset();
    vi.mocked(listFileManagerNodes).mockReset();
    vi.mocked(getFileManagerFileContent).mockReset();
    vi.mocked(listFileManagerNodes).mockImplementation(({ path }) =>
      Promise.resolve({
        root: "workspace",
        currentPath: path ?? ".",
        absolutePath: path === "src" ? "/tmp/.cc/workspace/src" : "/tmp/.cc/workspace",
        sizeBytes: path === "src" ? 2048 : 4096,
        lineCount: undefined,
        nodes:
          path === "src"
            ? [
                {
                  name: "index.ts",
                  path: "src/index.ts",
                  absolutePath: "/tmp/.cc/workspace/src/index.ts",
                  type: "file",
                  sizeBytes: 512,
                  lineCount: 12,
                  isCritical: false,
                },
              ]
            : [
                {
                  name: "AGENTS.md",
                  path: "AGENTS.md",
                  absolutePath: "/tmp/.cc/workspace/AGENTS.md",
                  type: "file",
                  sizeBytes: 128,
                  lineCount: 4,
                  isCritical: true,
                  criticalReason: "AGENTS.md defines the specialist instructions.",
                },
                {
                  name: "src",
                  path: "src",
                  absolutePath: "/tmp/.cc/workspace/src",
                  type: "directory",
                  sizeBytes: 2048,
                  isCritical: false,
                },
                {
                  name: "opencode.jsonc",
                  path: "opencode.jsonc",
                  absolutePath: "/tmp/.cc/workspace/opencode.jsonc",
                  type: "file",
                  sizeBytes: 64,
                  lineCount: 2,
                  isCritical: true,
                  criticalReason:
                    "This file stores workspace-level OpenCode configuration managed by CommandsCenter.",
                },
              ],
      }),
    );
    vi.mocked(getFileManagerFileContent).mockImplementation(({ root, path }) =>
      Promise.resolve({
        root,
        path,
        absolutePath: `/abs/${path}`,
        name: path,
        kind: "text",
        content: `// ${path}`,
        revision: { mtimeMs: 1, sizeBytes: 32, sha256: "a".repeat(64) },
        isWritable: true,
        mimeType: "text/plain",
      }),
    );
    vi.mocked(createFileManagerEntry).mockResolvedValue({ path: "src/new-file.ts" });
    vi.mocked(renameFileManagerEntry).mockResolvedValue({ path: "src/renamed.ts" });
    vi.mocked(moveFileManagerEntry).mockResolvedValue({ path: "src/index.ts" });
    vi.mocked(searchFileManagerDirectories).mockResolvedValue({
      directories: [".", "src", "docs", "tools-docs"],
    });
    vi.mocked(deleteFileManagerEntry).mockResolvedValue();
  });

  it("loads workspace root from handoff params and navigates folders", async () => {
    renderWithRoute("/files?root=workspace&path=src");

    await screen.findByText("index.ts");

    expect(getRootTab("Workspace")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "src" })).toBeInTheDocument();
    expect(listFileManagerNodes).toHaveBeenCalledWith({
      root: "workspace",
      path: "src",
    });
  });

  it("switches roots and resets path state", async () => {
    renderWithRoute("/files?root=workspace&path=src");

    await screen.findByText("index.ts");

    fireEvent.click(getRootTab("All Specialists"));

    await waitFor(() => {
      expect(listFileManagerNodes).toHaveBeenLastCalledWith({
        root: "all-specialists",
        path: ".",
      });
    });
    expect(getRootTab("All Specialists")).toHaveAttribute("aria-pressed", "true");
  });

  it("selects folders without auto-opening them and opens them explicitly", async () => {
    renderWithRoute("/files");

    await screen.findAllByText("src");

    fireEvent.click(screen.getByTestId("file-row-src"));

    expect(screen.getByText("/tmp/.cc/workspace/src")).toBeInTheDocument();
    expect(listFileManagerNodes).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(listFileManagerNodes).toHaveBeenLastCalledWith({
        root: "workspace",
        path: "src",
      });
    });
  });

  it("opens folders on double click after selecting them", async () => {
    renderWithRoute("/files");

    await screen.findAllByText("src");

    const folderRow = screen.getByTestId("file-row-src");
    expect(folderRow).not.toBeNull();

    fireEvent.doubleClick(folderRow);

    await waitFor(() => {
      expect(listFileManagerNodes).toHaveBeenLastCalledWith({
        root: "workspace",
        path: "src",
      });
    });
  });

  it("navigates collapsed breadcrumbs through the ellipsis button", async () => {
    renderWithRoute(
      "/files?root=host-filesystem&path=root/System/Library/Accounts/Authentication/AAIDSAuthenticationPlugin.bundle/Contents/_CodeSignature",
    );

    const ellipsis = await screen.findByRole("button", { name: "..." });

    expect(ellipsis).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "AAIDSAuthenticationPlugin.bundle" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contents" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "_CodeSignature" })).toBeInTheDocument();

    fireEvent.click(ellipsis);

    await waitFor(() => {
      expect(listFileManagerNodes).toHaveBeenLastCalledWith({
        root: "host-filesystem",
        path: "root/System/Library/Accounts/Authentication",
      });
    });
  });

  it("navigates to the parent directory with back", async () => {
    renderWithRoute(
      "/files?root=host-filesystem&path=root/System/Library/Accounts/Authentication/AAIDSAuthenticationPlugin.bundle/Contents/_CodeSignature",
    );

    await screen.findByRole("button", { name: "Go to parent folder" });

    fireEvent.click(screen.getByRole("button", { name: "Go to parent folder" }));

    await waitFor(() => {
      expect(listFileManagerNodes).toHaveBeenLastCalledWith({
        root: "host-filesystem",
        path: "root/System/Library/Accounts/Authentication/AAIDSAuthenticationPlugin.bundle/Contents",
      });
    });
  });

  it("creates files in the current directory and shows copyable absolute path details", async () => {
    renderWithRoute("/files");

    await screen.findAllByText("AGENTS.md");
    expect(getRootTab("Workspace")).toHaveAttribute("aria-pressed", "true");

    const agentsMdButtons = screen.getAllByRole("button", { name: /AGENTS\.md/i });
    fireEvent.click(agentsMdButtons[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Copy file path" }));

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith("/tmp/.cc/workspace/AGENTS.md");
    });
    expect(screen.getByText("0.1 KB")).toBeInTheDocument();
    expect(screen.getByText("4 lines")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open file/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rename file/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete file/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    expect(screen.getByRole("dialog", { name: "Create file" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "new-file.ts" },
    });
    fireEvent.click(
      screen.getByRole("dialog", { name: "Create file" }).querySelector('button[type="submit"]')!,
    );

    await waitFor(() => {
      expect(createFileManagerEntry).toHaveBeenCalledWith({
        root: "workspace",
        parentPath: ".",
        name: "new-file.ts",
        type: "file",
      });
    });
  });

  it("creates folders with the create folder modal", async () => {
    renderWithRoute("/files");

    await screen.findAllByText("AGENTS.md");

    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    expect(screen.getByRole("dialog", { name: "Create folder" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "new-folder" },
    });
    fireEvent.click(
      screen.getByRole("dialog", { name: "Create folder" }).querySelector('button[type="submit"]')!,
    );

    await waitFor(() => {
      expect(createFileManagerEntry).toHaveBeenCalledWith({
        root: "workspace",
        parentPath: ".",
        name: "new-folder",
        type: "directory",
      });
    });
  });

  it("uses in-app dialogs for rename and delete", async () => {
    renderWithRoute("/files");

    await screen.findAllByText("src");

    fireEvent.click(screen.getByTestId("file-row-src"));
    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));

    expect(screen.getByRole("dialog", { name: "Rename entry" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "New name" }), {
      target: { value: "renamed-src" },
    });
    fireEvent.click(
      screen.getByRole("dialog", { name: "Rename entry" }).querySelector('button[type="submit"]')!,
    );

    await waitFor(() => {
      expect(renameFileManagerEntry).toHaveBeenCalledWith({
        root: "workspace",
        path: "src",
        name: "renamed-src",
      });
    });

    fireEvent.click(screen.getByTestId("file-row-src"));
    fireEvent.click(screen.getByRole("tab", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    expect(screen.getByRole("dialog", { name: "Delete entry" })).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("dialog", { name: "Delete entry" }).querySelectorAll("button")[1]!,
    );

    await waitFor(() => {
      expect(deleteFileManagerEntry).toHaveBeenCalledWith({
        root: "workspace",
        path: "src",
      });
    });
  });

  it("moves an entry with the move dialog", async () => {
    const user = userEvent.setup();
    renderWithRoute("/files");

    await screen.findAllByText("src");

    await user.click(screen.getByTestId("file-row-src"));
    await user.click(screen.getByRole("tab", { name: "Actions" }));
    await user.click(await screen.findByRole("button", { name: "Move directory" }));

    expect(screen.getByRole("dialog", { name: "Move entry" })).toBeInTheDocument();
    await waitFor(() => {
      expect(searchFileManagerDirectories).toHaveBeenCalledWith({
        root: "workspace",
        query: "",
        excludePath: "src",
        limit: 200,
      });
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Search destination folders" }), {
      target: { value: "docs" },
    });
    await waitFor(() => {
      expect(searchFileManagerDirectories).toHaveBeenCalledWith({
        root: "workspace",
        query: "docs",
        excludePath: "src",
        limit: 200,
      });
    });

    fireEvent.click(await screen.findByRole("button", { name: "docs" }));
    expect(screen.getByText("Selected destination: docs")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("dialog", { name: "Move entry" }).querySelector('button[type="submit"]')!,
    );

    await waitFor(() => {
      expect(moveFileManagerEntry).toHaveBeenCalledWith({
        root: "workspace",
        path: "src",
        destinationPath: "docs",
      });
    });
  });

  it("shows a files-list drop target for direct uploads", async () => {
    renderWithRoute("/files");

    const dropzone = await screen.findByTestId("file-manager-list-dropzone");
    expect(dropzone).toHaveTextContent("Drop files here.");
  });

  it("hides rename and delete actions for critical workspace files", async () => {
    renderWithRoute("/files");

    await screen.findAllByText("opencode.jsonc");

    const criticalRow = screen
      .getAllByText("opencode.jsonc")[0]
      ?.closest('[role="button"]') as HTMLElement | null;
    expect(criticalRow).not.toBeNull();

    fireEvent.click(criticalRow!);

    expect(within(criticalRow!).queryByLabelText("Rename")).not.toBeInTheDocument();
    expect(within(criticalRow!).queryByLabelText("Delete")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rename file/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete file/i })).not.toBeInTheDocument();
  });

  it("reacts to same-route search param handoffs for file reveal and editor opening", async () => {
    window.history.replaceState({}, "", "/files?root=workspace");

    render(
      <BrowserRouter>
        <Routes>
          <Route element={<FileManagerPage />} path="/files" />
        </Routes>
      </BrowserRouter>,
    );

    await screen.findAllByText("AGENTS.md");

    act(() => {
      window.history.pushState(
        {},
        "",
        "/files?root=workspace&path=src&select=src%2Findex.ts&tabs=workspace:src%252Findex.ts&active=workspace:src/index.ts",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => {
      expect(listFileManagerNodes).toHaveBeenLastCalledWith({
        root: "workspace",
        path: "src",
      });
    });
    expect(screen.getByTestId("file-row-src/index.ts")).toHaveAttribute("aria-pressed", "true");
    await screen.findByTestId("editor-tab-workspace:src/index.ts");
  });
});

function getRootTab(name: string) {
  return screen
    .getAllByRole("button", { name })
    .find((element) => element.hasAttribute("aria-pressed")) as HTMLElement;
}

function renderWithRoute(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <FileManagerPage />
    </MemoryRouter>,
  );
}

describe("FileManagerPage editor tabs", () => {
  beforeEach(() => {
    vi.mocked(listFileManagerNodes).mockReset();
    vi.mocked(listFileManagerNodes).mockResolvedValue({
      root: "workspace",
      currentPath: ".",
      absolutePath: "/tmp/.cc/workspace",
      sizeBytes: 4096,
      lineCount: undefined,
      nodes: [
        {
          name: "alpha.ts",
          path: "alpha.ts",
          absolutePath: "/tmp/.cc/workspace/alpha.ts",
          type: "file",
          sizeBytes: 32,
          lineCount: 4,
          isCritical: false,
        },
        {
          name: "beta.ts",
          path: "beta.ts",
          absolutePath: "/tmp/.cc/workspace/beta.ts",
          type: "file",
          sizeBytes: 32,
          lineCount: 4,
          isCritical: false,
        },
      ],
    });
    vi.mocked(getFileManagerFileContent).mockReset();
    vi.mocked(getFileManagerFileContent).mockImplementation(({ root, path }) =>
      Promise.resolve({
        root,
        path,
        absolutePath: `/abs/${path}`,
        name: path,
        kind: "text",
        content: `// ${path}`,
        revision: { mtimeMs: 1, sizeBytes: 32, sha256: "a".repeat(64) },
        isWritable: true,
        mimeType: "text/plain",
      }),
    );
  });

  it("opens two files into separate tabs", async () => {
    renderWithRoute("/files?root=workspace");
    const alpha = (await screen.findAllByText("alpha.ts"))[0]?.closest('[role="button"]');
    fireEvent.doubleClick(alpha!);
    await waitFor(() =>
      expect(screen.getByTestId("editor-tab-workspace:alpha.ts")).toBeInTheDocument(),
    );
    const beta = (await screen.findAllByText("beta.ts"))[0]?.closest('[role="button"]');
    fireEvent.doubleClick(beta!);
    await waitFor(() =>
      expect(screen.getByTestId("editor-tab-workspace:beta.ts")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("editor-tab-workspace:alpha.ts")).toBeInTheDocument();
  });

  it("closes a clean tab via the × button", async () => {
    renderWithRoute("/files?root=workspace");
    const alpha = (await screen.findAllByText("alpha.ts"))[0]?.closest('[role="button"]');
    fireEvent.doubleClick(alpha!);
    await screen.findByTestId("editor-tab-workspace:alpha.ts");
    fireEvent.click(screen.getByTestId("editor-tab-close-workspace:alpha.ts"));
    await waitFor(() =>
      expect(screen.queryByTestId("editor-tab-workspace:alpha.ts")).not.toBeInTheDocument(),
    );
  });
});
