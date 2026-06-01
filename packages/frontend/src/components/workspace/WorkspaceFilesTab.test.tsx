import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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

const srcChildren = [
  { name: "index.ts", path: "src/index.ts", type: "file" as const },
  { name: "components", path: "src/components", type: "directory" as const },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.connectWorkspaceEvents).mockImplementation(async function* () {});
  vi.mocked(api.createFileManagerEntry).mockResolvedValue({ path: "new-folder" });
  vi.mocked(api.deleteFileManagerEntry).mockResolvedValue();
  vi.mocked(api.moveFileManagerEntry).mockResolvedValue({ path: "src/README.md" });
  vi.mocked(api.uploadFileManagerEntries).mockResolvedValue({ uploaded: [], rejected: [] });
});

describe("WorkspaceFilesTab", () => {
  it("shows loading state while the initial fetch is in progress", () => {
    vi.mocked(api.getWorkspaceTree).mockReturnValue(new Promise(() => {}));

    renderWithRouter();

    expect(screen.getByText("Loading files...")).toBeInTheDocument();
  });

  it("shows error state when the initial fetch fails", async () => {
    vi.mocked(api.getWorkspaceTree).mockRejectedValueOnce(new Error("Failed root load"));

    renderWithRouter();

    expect(await screen.findByText("Failed root load")).toBeInTheDocument();
  });

  it("shows empty state when the root returns no nodes", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce([]);

    renderWithRouter();

    expect(await screen.findByText("No files in workspace")).toBeInTheDocument();
  });

  it("renders file and directory nodes from the API response", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);

    renderWithRouter();

    expect(
      await screen.findByText(
        "Drop files here to upload. Drag files into message area to mention.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("src")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });

  it("hides critical entries from the workspace file tab", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce([
      ...rootNodes,
      {
        name: "AGENTS.md",
        path: "AGENTS.md",
        type: "file",
        isCritical: true,
        criticalReason: "Protected",
      },
    ]);

    renderWithRouter();

    expect(await screen.findByText("src")).toBeInTheDocument();
    expect(screen.queryByText("AGENTS.md")).not.toBeInTheDocument();
  });

  it("highlights a file node when it is clicked", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);
    const user = userEvent.setup();

    renderWithRouter();

    const fileButton = await screen.findByRole("button", { name: /^README.md$/i });
    await user.click(fileButton);

    expect(fileButton.parentElement?.className).toContain("text-accent");
  });

  it("clicking a directory triggers a child getWorkspaceTree call", async () => {
    vi.mocked(api.getWorkspaceTree)
      .mockResolvedValueOnce(rootNodes)
      .mockResolvedValueOnce(srcChildren);
    const user = userEvent.setup();

    renderWithRouter();

    await user.click(getNodeButton(await screen.findByText("src")));

    await waitFor(() => {
      expect(api.getWorkspaceTree).toHaveBeenNthCalledWith(2, "agent-1", "src");
    });
    expect(await screen.findByText("index.ts")).toBeInTheDocument();
  });

  it("does not re-fetch when expanding the same directory a second time", async () => {
    vi.mocked(api.getWorkspaceTree)
      .mockResolvedValueOnce(rootNodes)
      .mockResolvedValueOnce(srcChildren);
    const user = userEvent.setup();

    renderWithRouter();

    const dirButton = getNodeButton(await screen.findByText("src"));
    await user.click(dirButton);
    await screen.findByText("index.ts");
    await user.click(dirButton);
    await user.click(dirButton);

    expect(api.getWorkspaceTree).toHaveBeenCalledTimes(2);
  });

  it("collapses a directory on second click", async () => {
    vi.mocked(api.getWorkspaceTree)
      .mockResolvedValueOnce(rootNodes)
      .mockResolvedValueOnce(srcChildren);
    const user = userEvent.setup();

    renderWithRouter();

    const dirButton = getNodeButton(await screen.findByText("src"));
    await user.click(dirButton);
    expect(await screen.findByText("index.ts")).toBeInTheDocument();

    await user.click(dirButton);

    await waitFor(() => {
      expect(screen.queryByText("index.ts")).not.toBeInTheDocument();
    });
  });

  it("routes the location button to the file manager reveal view", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);
    const user = userEvent.setup();

    renderWithRouter();

    await user.click(await screen.findByRole("button", { name: "Show README.md in file manager" }));

    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent(
        "/files?root=workspace&path=agents%2Ftesting-agent&select=agents%2Ftesting-agent%2FREADME.md",
      );
    });
  });

  it("opens a file in the quick editor from the secondary icon", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);
    const onOpenFile = vi.fn();
    const user = userEvent.setup();

    renderWithRouter({ onOpenFile });

    await user.click(await screen.findByRole("button", { name: "Open README.md in quick editor" }));

    expect(onOpenFile).toHaveBeenCalledWith("README.md");
  });

  it("hides the quick editor action when no open handler is provided", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);

    renderWithRouter();

    expect(await screen.findByText("README.md")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open README.md in quick editor" }),
    ).not.toBeInTheDocument();
  });

  it("opens a file in the quick editor on double click", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);
    const onOpenFile = vi.fn();
    const user = userEvent.setup();

    renderWithRouter({ onOpenFile });

    await user.dblClick(await screen.findByRole("button", { name: /^README.md$/i }));

    expect(onOpenFile).toHaveBeenCalledWith("README.md");
  });

  it("refreshes the visible tree after a workspace change event", async () => {
    vi.mocked(api.getWorkspaceTree)
      .mockResolvedValueOnce(rootNodes)
      .mockResolvedValueOnce([
        ...rootNodes,
        { name: "new-file.md", path: "new-file.md", type: "file" as const },
      ]);
    vi.mocked(api.connectWorkspaceEvents).mockImplementation(() => makeWorkspaceEvents());

    renderWithRouter();

    expect(await screen.findByText("README.md")).toBeInTheDocument();

    await waitFor(
      () => {
        expect(api.getWorkspaceTree).toHaveBeenCalledTimes(2);
      },
      { timeout: 1500 },
    );
    expect(await screen.findByText("new-file.md")).toBeInTheDocument();
  });

  it("creates a folder from the inline root action", async () => {
    vi.mocked(api.getWorkspaceTree)
      .mockResolvedValueOnce(rootNodes)
      .mockResolvedValueOnce(rootNodes);
    const user = userEvent.setup();

    renderWithRouter();

    await user.click(await screen.findByRole("button", { name: "Create folder" }));
    await user.type(screen.getByRole("textbox", { name: "New folder name" }), "new-folder");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(api.createFileManagerEntry).toHaveBeenCalledWith({
        root: "workspace",
        parentPath: "agents/testing-agent",
        name: "new-folder",
        type: "directory",
      });
    });
  });

  it("deletes a non-critical node from the row action", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.getWorkspaceTree)
      .mockResolvedValueOnce(rootNodes)
      .mockResolvedValueOnce(rootNodes);
    const user = userEvent.setup();

    renderWithRouter();

    await user.click(await screen.findByRole("button", { name: "Delete README.md" }));

    await waitFor(() => {
      expect(api.deleteFileManagerEntry).toHaveBeenCalledWith({
        root: "workspace",
        path: "agents/testing-agent/README.md",
      });
    });
  });
});

function renderWithRouter(options?: { onOpenFile?: (path: string) => void }) {
  return render(
    <MemoryRouter initialEntries={["/chat/agent-1/conversation-1"]}>
      <Routes>
        <Route
          element={
            <>
              <WorkspaceFilesTab
                agentId="agent-1"
                agentSlug="testing-agent"
                onOpenFile={options?.onOpenFile}
              />
              <LocationProbe />
            </>
          }
          path="*"
        />
      </Routes>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

function getNodeButton(label: HTMLElement) {
  return label.closest("button") as HTMLButtonElement;
}

async function* makeWorkspaceEvents() {
  await Promise.resolve();
  yield { type: "workspace.changed" as const, properties: { version: 1 } };
}
