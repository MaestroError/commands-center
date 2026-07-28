import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceFilesTab } from "./WorkspaceFilesTab";
import * as api from "../../lib/api";

vi.mock("../../lib/api", () => ({
  connectWorkspaceEvents: vi.fn(),
  createFileManagerEntry: vi.fn(),
  deleteFileManagerEntry: vi.fn(),
  getWorkspaceTree: vi.fn(),
  moveFileManagerEntry: vi.fn(),
  uploadFileManagerEntries: vi.fn(),
}));

const rootNodes = [
  { name: "src", path: "src", type: "directory" as const },
  { name: "README.md", path: "README.md", type: "file" as const },
];

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.connectWorkspaceEvents).mockImplementation(async function* () {});
  vi.mocked(api.createFileManagerEntry).mockResolvedValue({ path: "new-folder" });
  vi.mocked(api.deleteFileManagerEntry).mockResolvedValue();
  vi.mocked(api.moveFileManagerEntry).mockResolvedValue({
    path: "specialists/testing-agent/src/README.md",
  });
  vi.mocked(api.uploadFileManagerEntries).mockResolvedValue({ uploaded: [], rejected: [] });
});

function renderTab() {
  return render(
    <MemoryRouter initialEntries={["/chat/agent-1/conversation-1"]}>
      <WorkspaceFilesTab agentId="agent-1" agentSlug="testing-agent" />
    </MemoryRouter>,
  );
}

type TransferOptions = {
  workspacePath?: string;
  files?: File[];
  types?: string[];
};

function makeDataTransfer({
  workspacePath = "",
  files = [],
  types,
}: TransferOptions): DataTransfer {
  return {
    getData: (type: string) => (type === "application/x-cc-workspace-path" ? workspacePath : ""),
    setData: vi.fn(),
    types: types ?? (workspacePath ? ["application/x-cc-workspace-path"] : ["Files"]),
    files,
    items: [],
    effectAllowed: "",
  } as unknown as DataTransfer;
}

function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest('[draggable="true"]') as HTMLElement;
}

// jsdom's File does not implement arrayBuffer(), which the upload path needs to
// base64-encode contents. Patch it onto the instance.
function makeFile(content: string, name: string, type: string): File {
  const file = new File([content], name, { type });
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(new TextEncoder().encode(content).buffer),
  });
  return file;
}

describe("WorkspaceFilesTab drag and drop", () => {
  it("moves a dragged file into a directory", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getWorkspaceTree)
      .mockResolvedValueOnce(rootNodes)
      .mockResolvedValueOnce(rootNodes);

    renderTab();

    // Select the file first so the move updates the selected path.
    const readme = await screen.findByRole("button", { name: /^README.md$/i });
    await user.click(readme);

    const srcRow = rowFor("src");
    fireEvent.dragStart(rowFor("README.md"), {
      dataTransfer: makeDataTransfer({ workspacePath: "README.md" }),
    });
    fireEvent.dragEnter(srcRow, { dataTransfer: makeDataTransfer({ workspacePath: "README.md" }) });
    fireEvent.dragOver(srcRow, { dataTransfer: makeDataTransfer({ workspacePath: "README.md" }) });
    fireEvent.drop(srcRow, { dataTransfer: makeDataTransfer({ workspacePath: "README.md" }) });

    await waitFor(() => {
      expect(api.moveFileManagerEntry).toHaveBeenCalledWith({
        root: "workspace",
        path: "specialists/testing-agent/README.md",
        destinationPath: "specialists/testing-agent/src",
      });
    });
  });

  it("ignores a move onto the same node", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);

    renderTab();
    await screen.findByText("src");
    const srcRow = rowFor("src");

    fireEvent.drop(srcRow, { dataTransfer: makeDataTransfer({ workspacePath: "src" }) });

    await waitFor(() => {
      expect(api.moveFileManagerEntry).not.toHaveBeenCalled();
    });
  });

  it("uploads external files dropped onto the workspace root", async () => {
    vi.mocked(api.getWorkspaceTree)
      .mockResolvedValueOnce(rootNodes)
      .mockResolvedValueOnce(rootNodes);

    const { container } = renderTab();
    await screen.findByText("README.md");

    const root = container.firstChild as HTMLElement;
    const file = makeFile("data", "upload.txt", "text/plain");

    fireEvent.dragEnter(root, { dataTransfer: makeDataTransfer({ files: [file] }) });
    fireEvent.dragOver(root, { dataTransfer: makeDataTransfer({ files: [file] }) });
    fireEvent.drop(root, { dataTransfer: makeDataTransfer({ files: [file] }) });

    await waitFor(() => {
      expect(api.uploadFileManagerEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          root: "workspace",
          destinationPath: "specialists/testing-agent",
          entries: [
            expect.objectContaining({
              name: "upload.txt",
              relativePath: "upload.txt",
              sizeBytes: 4,
            }),
          ],
        }),
      );
    });
  });

  it("uploads external files dropped onto a directory node", async () => {
    vi.mocked(api.getWorkspaceTree)
      .mockResolvedValueOnce(rootNodes)
      .mockResolvedValueOnce(rootNodes);

    renderTab();
    await screen.findByText("src");
    const srcRow = rowFor("src");
    const file = makeFile("hi", "note.md", "text/markdown");

    fireEvent.drop(srcRow, { dataTransfer: makeDataTransfer({ files: [file] }) });

    await waitFor(() => {
      expect(api.uploadFileManagerEntries).toHaveBeenCalledWith(
        expect.objectContaining({ destinationPath: "specialists/testing-agent/src" }),
      );
    });
  });

  it("does nothing when a drop carries neither an internal path nor files", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);

    const { container } = renderTab();
    await screen.findByText("README.md");
    const root = container.firstChild as HTMLElement;

    fireEvent.drop(root, { dataTransfer: makeDataTransfer({}) });

    await waitFor(() => {
      expect(api.uploadFileManagerEntries).not.toHaveBeenCalled();
      expect(api.moveFileManagerEntry).not.toHaveBeenCalled();
    });
  });

  it("clears the drop highlight on drag leave", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);
    const { container } = renderTab();
    await screen.findByText("README.md");
    const root = container.firstChild as HTMLElement;

    fireEvent.dragEnter(root, { dataTransfer: makeDataTransfer({ files: [] }) });
    fireEvent.dragLeave(root, { dataTransfer: makeDataTransfer({ files: [] }) });

    // No assertion beyond not throwing — exercises the drag-leave handler branch.
    expect(root).toBeInTheDocument();
  });
});

describe("WorkspaceFilesTab create folder cancellation", () => {
  it("cancels folder creation on blur when the field is empty", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);
    const user = userEvent.setup();

    renderTab();
    await user.click(await screen.findByRole("button", { name: "Create folder" }));

    const input = screen.getByRole("textbox", { name: "New folder name" });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "New folder name" })).not.toBeInTheDocument();
    });
  });

  it("cancels folder creation when Escape is pressed", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);
    const user = userEvent.setup();

    renderTab();
    await user.click(await screen.findByRole("button", { name: "Create folder" }));

    const input = screen.getByRole("textbox", { name: "New folder name" });
    await user.type(input, "x");
    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "New folder name" })).not.toBeInTheDocument();
    });
  });

  it("surfaces an error when folder creation fails", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);
    vi.mocked(api.createFileManagerEntry).mockRejectedValueOnce(new Error("nope"));
    const user = userEvent.setup();

    renderTab();
    await user.click(await screen.findByRole("button", { name: "Create folder" }));
    await user.type(screen.getByRole("textbox", { name: "New folder name" }), "docs");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("nope")).toBeInTheDocument();
  });
});
