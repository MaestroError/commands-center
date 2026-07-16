import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FileMentionPopover } from "./FileMentionPopover";
import * as api from "../../lib/api";

vi.mock("../../lib/api", () => ({
  searchAgentWorkspaceFiles: vi.fn(),
  searchWorkspaceFiles: vi.fn(),
  searchGlobalDocuments: vi.fn(),
}));

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    value: vi.fn(),
    configurable: true,
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  // Safe defaults so tests that don't exercise a given source don't reject.
  vi.mocked(api.searchGlobalDocuments).mockResolvedValue([]);
  vi.mocked(api.searchAgentWorkspaceFiles).mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    value: originalScrollIntoView,
    configurable: true,
  });
});

describe("FileMentionPopover", () => {
  it("loads file-name search results from the specialist workspace", async () => {
    vi.mocked(api.searchAgentWorkspaceFiles).mockResolvedValueOnce(["README.md", "src/index.ts"]);

    render(
      <FileMentionPopover
        agentId="agent-1"
        query="read"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onKeyDown={vi.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: /README\.md/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /src\/index\.ts/i })).toBeInTheDocument();
    expect(api.searchAgentWorkspaceFiles).toHaveBeenCalledWith("agent-1", "read");
  });

  it("loads file-name search results from the full workspace without a specialist", async () => {
    vi.mocked(api.searchWorkspaceFiles).mockResolvedValueOnce({
      nameMatches: [{ path: "README.md" }, { path: "src/index.ts" }],
      contentMatches: [],
      documentMatches: [],
    });

    render(
      <FileMentionPopover query="read" onSelect={vi.fn()} onClose={vi.fn()} onKeyDown={vi.fn()} />,
    );

    expect(await screen.findByRole("button", { name: /README\.md/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /src\/index\.ts/i })).toBeInTheDocument();
    expect(api.searchWorkspaceFiles).toHaveBeenCalledWith("read");
    expect(api.searchAgentWorkspaceFiles).not.toHaveBeenCalled();
  });

  it("filters node_modules results from file mentions", async () => {
    vi.mocked(api.searchAgentWorkspaceFiles).mockResolvedValueOnce([
      "README.md",
      "node_modules/package/index.js",
      "src/node_modules/test.js",
    ]);

    render(
      <FileMentionPopover
        agentId="agent-1"
        query="node"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onKeyDown={vi.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: /README\.md/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /node_modules/i })).not.toBeInTheDocument();
  });

  it("includes document matches in global workspace search results", async () => {
    vi.mocked(api.searchWorkspaceFiles).mockResolvedValueOnce({
      nameMatches: [{ path: "src/index.ts" }],
      contentMatches: [],
      documentMatches: [
        {
          relativePath: "design/overview.md",
          fullPath: "/workspace/Documents/design/overview.md",
          title: "Architecture Overview",
          description: "System design notes",
        },
      ],
    });

    render(
      <FileMentionPopover
        query="overview"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onKeyDown={vi.fn()}
      />,
    );

    expect(await screen.findByText("Architecture Overview")).toBeInTheDocument();
    expect(screen.getByText("Documents/design/overview.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /src\/index\.ts/i })).toBeInTheDocument();
  });

  it("selects a document mention with workspace-relative path", async () => {
    vi.mocked(api.searchWorkspaceFiles).mockResolvedValueOnce({
      nameMatches: [],
      contentMatches: [],
      documentMatches: [
        {
          relativePath: "notes.md",
          fullPath: "/workspace/Documents/notes.md",
          title: "Notes",
          description: null,
        },
      ],
    });
    const onSelect = vi.fn();

    render(
      <FileMentionPopover
        query="notes"
        onSelect={onSelect}
        onClose={vi.fn()}
        onKeyDown={vi.fn()}
      />,
    );

    const button = await screen.findByText("Notes");
    fireEvent.click(button.closest("button")!);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith({
        path: "Documents/notes.md",
        filename: "notes.md",
        kind: "document",
      });
    });
  });

  it("searches global documents (not the global workspace) within a specialist workspace", async () => {
    vi.mocked(api.searchAgentWorkspaceFiles).mockResolvedValueOnce(["README.md"]);

    render(
      <FileMentionPopover
        agentId="agent-1"
        query="read"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onKeyDown={vi.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: /README\.md/i })).toBeInTheDocument();
    expect(api.searchGlobalDocuments).toHaveBeenCalledWith("read");
    expect(api.searchWorkspaceFiles).not.toHaveBeenCalled();
  });

  it("surfaces global documents as distinct options in a specialist workspace", async () => {
    vi.mocked(api.searchAgentWorkspaceFiles).mockResolvedValueOnce(["src/index.ts"]);
    vi.mocked(api.searchGlobalDocuments).mockResolvedValueOnce([
      {
        scope: "global",
        ownerSlug: null,
        ownerSpecialistId: null,
        relativePath: "design/overview.md",
        fullPath: "/workspace/Documents/design/overview.md",
        title: "Architecture Overview",
        description: null,
        author: null,
      },
    ]);
    const onSelect = vi.fn();

    render(
      <FileMentionPopover
        agentId="agent-1"
        query="overview"
        onSelect={onSelect}
        onClose={vi.fn()}
        onKeyDown={vi.fn()}
      />,
    );

    expect(await screen.findByText("Architecture Overview")).toBeInTheDocument();
    expect(screen.getByText("Global Document: design/overview.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /src\/index\.ts/i })).toBeInTheDocument();

    fireEvent.click(screen.getByText("Architecture Overview").closest("button")!);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith({
        path: "design/overview.md",
        filename: "Architecture Overview",
        kind: "global-document",
      });
    });
  });

  it("keeps rendering global documents when the workspace file search fails", async () => {
    vi.mocked(api.searchAgentWorkspaceFiles).mockRejectedValueOnce(new Error("boom"));
    vi.mocked(api.searchGlobalDocuments).mockResolvedValueOnce([
      {
        scope: "global",
        ownerSlug: null,
        ownerSpecialistId: null,
        relativePath: "notes.md",
        fullPath: "/workspace/Documents/notes.md",
        title: "Notes",
        description: null,
        author: null,
      },
    ]);

    render(
      <FileMentionPopover
        agentId="agent-1"
        query="notes"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onKeyDown={vi.fn()}
      />,
    );

    expect(await screen.findByText("Notes")).toBeInTheDocument();
  });

  it("opens upward so it is not clipped below the composer", () => {
    render(
      <FileMentionPopover query="read" onSelect={vi.fn()} onClose={vi.fn()} onKeyDown={vi.fn()} />,
    );

    const container = screen.getByText("File mention").parentElement as HTMLElement;
    expect(container.style.bottom).toBe("calc(100% + 4px)");
    expect(container.style.top).toBe("");
  });

  it("selects the active result when Enter is pressed", async () => {
    vi.mocked(api.searchAgentWorkspaceFiles).mockResolvedValueOnce(["README.md", "src/index.ts"]);
    const onSelect = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <FileMentionPopover
        agentId="agent-1"
        query="read"
        onSelect={onSelect}
        onClose={vi.fn()}
        onKeyDown={onKeyDown}
      />,
    );

    await screen.findByRole("button", { name: /README\.md/i });

    fireEvent.keyDown(screen.getByText("File mention").closest("div") as HTMLElement, {
      key: "Enter",
    });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith({
        path: "README.md",
        filename: "README.md",
        kind: "file",
      });
    });
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});
