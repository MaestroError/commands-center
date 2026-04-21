import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

    render(<WorkspaceFilesTab agentId="agent-1" />);

    expect(screen.getByText("Loading files...")).toBeInTheDocument();
  });

  it("shows error state when the initial fetch fails", async () => {
    vi.mocked(api.getWorkspaceTree).mockRejectedValueOnce(new Error("Failed root load"));

    render(<WorkspaceFilesTab agentId="agent-1" />);

    expect(await screen.findByText("Failed root load")).toBeInTheDocument();
  });

  it("shows empty state when the root returns no nodes", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce([]);

    render(<WorkspaceFilesTab agentId="agent-1" />);

    expect(await screen.findByText("No files in workspace")).toBeInTheDocument();
  });

  it("renders file and directory nodes from the API response", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);

    render(<WorkspaceFilesTab agentId="agent-1" />);

    expect(await screen.findByRole("button", { name: /src/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /README.md/i })).toBeInTheDocument();
  });

  it("highlights a file node when it is clicked", async () => {
    vi.mocked(api.getWorkspaceTree).mockResolvedValueOnce(rootNodes);
    const user = userEvent.setup();

    render(<WorkspaceFilesTab agentId="agent-1" />);

    const fileButton = await screen.findByRole("button", { name: /README.md/i });
    await user.click(fileButton);

    expect(fileButton.className).toContain("text-accent");
  });

  it("clicking a directory triggers a child getWorkspaceTree call", async () => {
    vi.mocked(api.getWorkspaceTree)
      .mockResolvedValueOnce(rootNodes)
      .mockResolvedValueOnce(srcChildren);
    const user = userEvent.setup();

    render(<WorkspaceFilesTab agentId="agent-1" />);

    await user.click(await screen.findByRole("button", { name: /src/i }));

    await waitFor(() => {
      expect(api.getWorkspaceTree).toHaveBeenNthCalledWith(2, "agent-1", "src");
    });
    expect(await screen.findByRole("button", { name: /index.ts/i })).toBeInTheDocument();
  });

  it("does not re-fetch when expanding the same directory a second time", async () => {
    vi.mocked(api.getWorkspaceTree)
      .mockResolvedValueOnce(rootNodes)
      .mockResolvedValueOnce(srcChildren);
    const user = userEvent.setup();

    render(<WorkspaceFilesTab agentId="agent-1" />);

    const dirButton = await screen.findByRole("button", { name: /src/i });
    await user.click(dirButton);
    await screen.findByRole("button", { name: /index.ts/i });
    await user.click(dirButton);
    await user.click(dirButton);

    expect(api.getWorkspaceTree).toHaveBeenCalledTimes(2);
  });

  it("collapses a directory on second click", async () => {
    vi.mocked(api.getWorkspaceTree)
      .mockResolvedValueOnce(rootNodes)
      .mockResolvedValueOnce(srcChildren);
    const user = userEvent.setup();

    render(<WorkspaceFilesTab agentId="agent-1" />);

    const dirButton = await screen.findByRole("button", { name: /src/i });
    await user.click(dirButton);
    expect(await screen.findByRole("button", { name: /index.ts/i })).toBeInTheDocument();

    await user.click(dirButton);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /index.ts/i })).not.toBeInTheDocument();
    });
  });
});
