import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileManagerPage } from "./FileManagerPage";

import {
  createFileManagerEntry,
  deleteFileManagerEntry,
  listFileManagerNodes,
  renameFileManagerEntry,
} from "@/lib/api";

vi.mock("@/lib/api", () => ({
  listFileManagerNodes: vi.fn(),
  createFileManagerEntry: vi.fn(),
  renameFileManagerEntry: vi.fn(),
  deleteFileManagerEntry: vi.fn(),
}));

describe("FileManagerPage", () => {
  const confirmSpy = vi.spyOn(window, "confirm");
  const writeTextSpy = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    confirmSpy.mockReset();
    confirmSpy.mockReturnValue(true);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextSpy,
      },
    });
    writeTextSpy.mockReset();
    vi.mocked(createFileManagerEntry).mockReset();
    vi.mocked(deleteFileManagerEntry).mockReset();
    vi.mocked(renameFileManagerEntry).mockReset();
    vi.mocked(listFileManagerNodes).mockReset();
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
                  criticalReason: "AGENTS.md defines the agent instructions.",
                },
                {
                  name: "src",
                  path: "src",
                  absolutePath: "/tmp/.cc/workspace/src",
                  type: "directory",
                  sizeBytes: 2048,
                  isCritical: false,
                },
              ],
      }),
    );
    vi.mocked(createFileManagerEntry).mockResolvedValue({ path: "src/new-file.ts" });
    vi.mocked(renameFileManagerEntry).mockResolvedValue({ path: "src/renamed.ts" });
    vi.mocked(deleteFileManagerEntry).mockResolvedValue();
  });

  it("loads workspace root from handoff params and navigates folders", async () => {
    renderWithRoute("/files?root=workspace&path=src");

    await screen.findByText("index.ts");

    expect(screen.getByRole("button", { name: "Workspace" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Workspace / src")).toBeInTheDocument();
    expect(listFileManagerNodes).toHaveBeenCalledWith({
      root: "workspace",
      path: "src",
    });
  });

  it("selects folders without auto-opening them and opens them explicitly", async () => {
    renderWithRoute("/files");

    await screen.findAllByText("src");

    fireEvent.click(screen.getByText("src", { selector: "p" }).closest('[role="button"]')!);

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

  it("creates files in the current directory and shows copyable absolute path details", async () => {
    renderWithRoute("/files");

    await screen.findAllByText("AGENTS.md");
    expect(screen.getByRole("button", { name: "Workspace" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /AGENTS\.md/i }));
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

    fireEvent.click(screen.getByText("src", { selector: "p" }).closest('[role="button"]')!);
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

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

    fireEvent.click(screen.getByText("src", { selector: "p" }).closest('[role="button"]')!);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

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
});

function renderWithRoute(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <FileManagerPage />
    </MemoryRouter>,
  );
}
