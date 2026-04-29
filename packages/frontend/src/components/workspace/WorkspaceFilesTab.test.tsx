import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceFilesTab } from "./WorkspaceFilesTab";
import * as api from "../../lib/api";

vi.mock("../../lib/api", () => ({
  getWorkspaceTree: vi.fn(),
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

    expect(await screen.findByText("src")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
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

  it("opens a file in the quick editor on double click", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);
    const onOpenFile = vi.fn();
    const user = userEvent.setup();

    renderWithRouter({ onOpenFile });

    await user.dblClick(await screen.findByRole("button", { name: /^README.md$/i }));

    expect(onOpenFile).toHaveBeenCalledWith("README.md");
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
