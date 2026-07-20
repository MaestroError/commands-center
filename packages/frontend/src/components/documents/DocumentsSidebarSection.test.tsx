import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  getDocumentTree: vi.fn(),
  listSpecialists: vi.fn(),
  createDocument: vi.fn(),
  createDocumentFolder: vi.fn(),
}));

import { DocumentsSidebarSection } from "./DocumentsSidebarSection";
import { createDocument, getDocumentTree, listSpecialists } from "@/lib/api";
import type { DocumentTreeResponse, Specialist } from "@cc/shared/schemas";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

function renderSidebar(
  initialEntries: string[] = ["/documents"],
  options: { onOpenSearch?: () => void } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route
            path="/documents"
            element={
              <>
                <DocumentsSidebarSection
                  collapsed={false}
                  pathname="/documents"
                  onNavigate={() => undefined}
                  onOpenSearch={options.onOpenSearch ?? (() => undefined)}
                />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type RawDocumentTreeNode = Omit<
  DocumentTreeResponse["tree"][number],
  "scope" | "ownerSlug" | "ownerSpecialistId" | "children"
> & {
  children?: RawDocumentTreeNode[];
};

function tree(...nodes: RawDocumentTreeNode[]): DocumentTreeResponse {
  return { tree: nodes.map(scopedNode), privateTrees: [] };
}

function scopedNode(node: RawDocumentTreeNode): DocumentTreeResponse["tree"][number] {
  return {
    scope: "global",
    ownerSlug: null,
    ownerSpecialistId: null,
    ...node,
    children: node.children?.map(scopedNode),
  };
}

function specialist(overrides: Partial<Specialist> = {}): Specialist {
  return {
    id: "agent-planner",
    slug: "planner",
    name: "Planner",
    role: "Planning",
    instructions: "Plan work.",
    defaultModel: "openai/gpt-5",
    workspacePath: "/workspace/specialists/planner",
    status: "active",
    capabilities: {
      builtInSkills: [],
      workspaceSkills: [],
      customTools: [],
      mcpServers: [],
      toolPermissions: [],
      appMcpServers: [],
      appToolPermissions: [],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Unlike `renderSidebar`, this harness reads the live route via `useLocation`
 * and forwards it as `pathname`, the way `AppShell` does — so navigating
 * within the test actually changes `isActive` and exercises the
 * auto-expand/collapse effect.
 */
function renderWithNavigation(initialEntries: string[] = ["/documents"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });

  function Harness() {
    const location = useLocation();
    return (
      <>
        <DocumentsSidebarSection
          collapsed={false}
          onNavigate={() => undefined}
          onOpenSearch={() => undefined}
          pathname={location.pathname}
        />
        <Link to="/documents">Go to Documents</Link>
        <Link to="/documents?path=ProjectInfo%2Foverview.md">Go to Document</Link>
        <Link to="/tasks">Go to Tasks</Link>
      </>
    );
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listSpecialists).mockResolvedValue([specialist()]);
  vi.mocked(createDocument).mockResolvedValue({ documents: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DocumentsSidebarSection", () => {
  it("renders a New folder button on the Documents root only (no New document)", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(tree());

    renderSidebar();

    const section = await screen.findByTestId("documents-sidebar-section");
    expect(within(section).getByRole("button", { name: "New folder" })).toBeInTheDocument();
    // The root has no "New document" action — first level is always folders.
    expect(
      within(section).queryByRole("button", { name: /^New document$/ }),
    ).not.toBeInTheDocument();
  });

  it("opens global search from the Documents header search button", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(tree());
    const onOpenSearch = vi.fn();

    const user = userEvent.setup();
    renderSidebar(["/documents"], { onOpenSearch });

    await screen.findByTestId("documents-sidebar-section");
    await user.click(screen.getByRole("button", { name: "Search documents" }));

    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("can create the first private document for a specialist without an existing private tree", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(tree());

    const user = userEvent.setup();
    renderSidebar();

    await screen.findByTestId("documents-sidebar-section");
    await user.click(screen.getByRole("button", { name: "New private document" }));

    const picker = await screen.findByRole("dialog", { name: "New Private Document" });
    await user.click(within(picker).getByRole("combobox", { name: "Specialist" }));
    await user.click(await screen.findByRole("option", { name: "Planner" }));
    await user.click(within(picker).getByRole("button", { name: "Continue" }));

    const dialog = await screen.findByRole("dialog", { name: "New Document" });
    expect(within(dialog).getByDisplayValue("notes/")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Title"), "Research Notes");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(createDocument).toHaveBeenCalled();
    });
    expect(vi.mocked(createDocument).mock.calls[0]?.[0]).toEqual({
      scope: "private",
      ownerSlug: "planner",
      path: "notes/research-notes.md",
      title: "Research Notes",
      description: undefined,
    });
  });

  it("preserves the private-document picker's no-Escape dismissal contract", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(tree());
    const user = userEvent.setup();
    renderSidebar();

    await screen.findByTestId("documents-sidebar-section");
    await user.click(screen.getByRole("button", { name: "New private document" }));
    await screen.findByRole("dialog", { name: "New Private Document" });
    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog", { name: "New Private Document" })).toBeInTheDocument();
  });

  it("closes the private-document picker on overlay click", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(tree());
    const user = userEvent.setup();
    renderSidebar();

    await screen.findByTestId("documents-sidebar-section");
    await user.click(screen.getByRole("button", { name: "New private document" }));
    await screen.findByRole("dialog", { name: "New Private Document" });
    const overlay = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay!);

    expect(screen.queryByRole("dialog", { name: "New Private Document" })).not.toBeInTheDocument();
  });

  it("does not treat a private document URL without an owner as the selected target", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue({
      tree: [],
      privateTrees: [
        {
          ownerSlug: "planner",
          ownerSpecialistId: "agent-planner",
          ownerName: "Planner",
          tree: [
            {
              scope: "private",
              ownerSlug: "planner",
              ownerSpecialistId: "agent-planner",
              name: "research.md",
              relativePath: "notes/research.md",
              type: "file",
              title: "Research",
            },
          ],
        },
      ],
    });

    renderSidebar(["/documents?scope=private&path=notes%2Fresearch.md"]);

    const documentButton = await screen.findByRole("button", { name: "Research" });
    expect(documentButton).not.toHaveClass("text-accent");
    expect(screen.getByTestId("location-probe")).toHaveTextContent(
      "/documents?scope=private&path=notes%2Fresearch.md",
    );
  });

  it("renders folders and documents from the tree", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(
      tree({
        name: "ProjectInfo",
        relativePath: "ProjectInfo",
        type: "directory",
        title: null,
        children: [
          {
            name: "overview.md",
            relativePath: "ProjectInfo/overview.md",
            type: "file",
            title: "Overview",
          },
        ],
      }),
    );

    renderSidebar();

    expect(await screen.findByText("ProjectInfo")).toBeInTheDocument();
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
  });

  it("navigates to the folder view when a folder name is clicked, keeping the chevron for toggling", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(
      tree({
        name: "ProjectInfo",
        relativePath: "ProjectInfo",
        type: "directory",
        title: null,
        children: [
          {
            name: "overview.md",
            relativePath: "ProjectInfo/overview.md",
            type: "file",
            title: "Overview",
          },
        ],
      }),
    );

    const user = userEvent.setup();
    renderSidebar();

    // The folder name is its own button (distinct from the Expand chevron).
    await user.click(await screen.findByRole("button", { name: "ProjectInfo" }));

    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent(
        "/documents?folder=ProjectInfo",
      );
    });

    // The chevron still toggles independently.
    expect(screen.getByRole("button", { name: "Expand ProjectInfo" })).toBeInTheDocument();
  });

  it("navigates to the document path when a document is clicked", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(
      tree({
        name: "ProjectInfo",
        relativePath: "ProjectInfo",
        type: "directory",
        title: null,
        children: [
          {
            name: "overview.md",
            relativePath: "ProjectInfo/overview.md",
            type: "file",
            title: "Overview",
          },
        ],
      }),
    );

    const user = userEvent.setup();
    renderSidebar();

    await user.click(await screen.findByRole("button", { name: "Expand ProjectInfo" }));
    await user.click(await screen.findByText("Overview"));

    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent(
        "/documents?path=ProjectInfo%2Foverview.md",
      );
    });
  });

  it("offers both folder and document actions on a non-root folder", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(
      tree({
        name: "ProjectInfo",
        relativePath: "ProjectInfo",
        type: "directory",
        title: null,
        children: [],
      }),
    );

    renderSidebar();

    await screen.findByText("ProjectInfo");
    expect(screen.getByRole("button", { name: "New folder in ProjectInfo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New document in ProjectInfo" })).toBeInTheDocument();
  });

  it("hides the folder action on a depth-5 folder but keeps the document action", async () => {
    // a/b/c/d/e is depth 5 (5 path segments).
    vi.mocked(getDocumentTree).mockResolvedValue(tree(nestedFolder(["a", "b", "c", "d", "e"])));

    const user = userEvent.setup();
    renderSidebar();

    await user.click(await screen.findByRole("button", { name: "Expand a" }));
    await user.click(await screen.findByRole("button", { name: "Expand b" }));
    await user.click(await screen.findByRole("button", { name: "Expand c" }));
    await user.click(await screen.findByRole("button", { name: "Expand d" }));

    expect(await screen.findByText("e")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New folder in e" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New document in e" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New folder in d" })).toBeInTheDocument();
  });

  it("keeps folders collapsed by default when the Documents section opens", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(
      tree({
        name: "ProjectInfo",
        relativePath: "ProjectInfo",
        type: "directory",
        title: null,
        children: [
          {
            name: "overview.md",
            relativePath: "ProjectInfo/overview.md",
            type: "file",
            title: "Overview",
          },
        ],
      }),
    );

    renderSidebar();

    expect(await screen.findByText("ProjectInfo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand ProjectInfo" })).toBeInTheDocument();
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
  });

  it("refreshes the document tree once when manually reopened", async () => {
    vi.mocked(getDocumentTree)
      .mockResolvedValueOnce(
        tree({
          name: "Initial",
          relativePath: "Initial",
          type: "directory",
          title: null,
          children: [],
        }),
      )
      .mockResolvedValueOnce(
        tree({
          name: "Refreshed",
          relativePath: "Refreshed",
          type: "directory",
          title: null,
          children: [],
        }),
      );

    const user = userEvent.setup();
    renderSidebar();

    expect(await screen.findByText("Initial")).toBeInTheDocument();
    expect(getDocumentTree).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Collapse Documents" }));
    await user.click(screen.getByRole("button", { name: "Expand Documents" }));

    expect(await screen.findByText("Refreshed")).toBeInTheDocument();
    expect(getDocumentTree).toHaveBeenCalledTimes(2);
  });

  it("auto-expands the ancestor folder chain for the selected document", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(
      tree({
        name: "ProjectInfo",
        relativePath: "ProjectInfo",
        type: "directory",
        title: null,
        children: [
          {
            name: "Specs",
            relativePath: "ProjectInfo/Specs",
            type: "directory",
            title: null,
            children: [
              {
                name: "overview.md",
                relativePath: "ProjectInfo/Specs/overview.md",
                type: "file",
                title: "Overview",
              },
            ],
          },
        ],
      }),
    );

    renderSidebar(["/documents?path=ProjectInfo%2FSpecs%2Foverview.md"]);

    expect(await screen.findByText("ProjectInfo")).toBeInTheDocument();
    expect(await screen.findByText("Specs")).toBeInTheDocument();
    expect(await screen.findByText("Overview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse ProjectInfo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse Specs" })).toBeInTheDocument();
  });

  it("prefills the document path with the clicked folder when adding a document", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(
      tree({
        name: "ProjectInfo",
        relativePath: "ProjectInfo",
        type: "directory",
        title: null,
        children: [],
      }),
    );

    const user = userEvent.setup();
    renderSidebar();

    await screen.findByText("ProjectInfo");
    await user.click(screen.getByRole("button", { name: "New document in ProjectInfo" }));

    const dialog = await screen.findByRole("dialog");
    const pathInput = within(dialog).getByDisplayValue("ProjectInfo/");
    expect(pathInput).toBeInTheDocument();
  });

  it("prefills the parent folder when adding a nested folder", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(
      tree({
        name: "ProjectInfo",
        relativePath: "ProjectInfo",
        type: "directory",
        title: null,
        children: [],
      }),
    );

    const user = userEvent.setup();
    renderSidebar();

    await screen.findByText("ProjectInfo");
    await user.click(screen.getByRole("button", { name: "New folder in ProjectInfo" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByDisplayValue("ProjectInfo/")).toBeInTheDocument();
  });

  it("auto-collapses the Documents tree when navigating to another page", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(
      tree({
        name: "ProjectInfo",
        relativePath: "ProjectInfo",
        type: "directory",
        title: null,
        children: [],
      }),
    );

    const user = userEvent.setup();
    renderWithNavigation(["/documents"]);

    expect(await screen.findByText("ProjectInfo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse Documents" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Go to Tasks" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Expand Documents" })).toBeInTheDocument();
    });
    expect(screen.queryByText("ProjectInfo")).not.toBeInTheDocument();
  });

  it("auto-expands the Documents tree when navigating back into Documents", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(
      tree({
        name: "ProjectInfo",
        relativePath: "ProjectInfo",
        type: "directory",
        title: null,
        children: [],
      }),
    );

    const user = userEvent.setup();
    renderWithNavigation(["/tasks"]);

    expect(screen.getByRole("button", { name: "Expand Documents" })).toBeInTheDocument();
    expect(screen.queryByText("ProjectInfo")).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Go to Documents" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Collapse Documents" })).toBeInTheDocument();
    });
    expect(await screen.findByText("ProjectInfo")).toBeInTheDocument();
  });

  it("refreshes the document tree once when a document route auto-expands it", async () => {
    vi.mocked(getDocumentTree)
      .mockResolvedValueOnce(
        tree({
          name: "Initial",
          relativePath: "Initial",
          type: "directory",
          title: null,
          children: [],
        }),
      )
      .mockResolvedValueOnce(
        tree({
          name: "ProjectInfo",
          relativePath: "ProjectInfo",
          type: "directory",
          title: null,
          children: [
            {
              name: "overview.md",
              relativePath: "ProjectInfo/overview.md",
              type: "file",
              title: "Overview",
            },
          ],
        }),
      );

    const user = userEvent.setup();
    renderWithNavigation(["/documents"]);

    expect(await screen.findByText("Initial")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Go to Tasks" }));
    await user.click(screen.getByRole("link", { name: "Go to Document" }));

    expect(await screen.findByText("Overview")).toBeInTheDocument();
    expect(getDocumentTree).toHaveBeenCalledTimes(2);
  });

  it("does not override a manual toggle while staying on the Documents page", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue(
      tree({
        name: "ProjectInfo",
        relativePath: "ProjectInfo",
        type: "directory",
        title: null,
        children: [],
      }),
    );

    const user = userEvent.setup();
    renderWithNavigation(["/documents"]);

    expect(await screen.findByText("ProjectInfo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse Documents" }));

    expect(screen.queryByText("ProjectInfo")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Documents" })).toBeInTheDocument();
  });
});

function nestedFolder(segments: string[]): RawDocumentTreeNode {
  function build(index: number): RawDocumentTreeNode {
    const relativePath = segments.slice(0, index + 1).join("/");
    const children = index < segments.length - 1 ? [build(index + 1)] : [];
    return {
      name: segments[index]!,
      relativePath,
      type: "directory",
      title: null,
      children,
    };
  }
  return build(0);
}
