import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  getDocumentTree: vi.fn(),
  createDocument: vi.fn(),
  createDocumentFolder: vi.fn(),
}));

import { DocumentsSidebarSection } from "./DocumentsSidebarSection";
import { getDocumentTree } from "@/lib/api";
import type { DocumentTreeResponse } from "@cc/shared/schemas";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

function renderSidebar(
  initialEntries: string[] = ["/documents"],
  options: { onOpenSearch?: () => void } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

function tree(...nodes: DocumentTreeResponse["tree"]): DocumentTreeResponse {
  return { tree: nodes };
}

/**
 * Unlike `renderSidebar`, this harness reads the live route via `useLocation`
 * and forwards it as `pathname`, the way `AppShell` does — so navigating
 * within the test actually changes `isActive` and exercises the
 * auto-expand/collapse effect.
 */
function renderWithNavigation(initialEntries: string[] = ["/documents"]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

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

function nestedFolder(segments: string[]): DocumentTreeResponse["tree"][number] {
  function build(index: number): DocumentTreeResponse["tree"][number] {
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
