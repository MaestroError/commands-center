import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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

function renderSidebar(initialEntries: string[] = ["/documents"]) {
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
    expect(screen.getByText("Overview")).toBeInTheDocument();
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

    renderSidebar();

    // All folders default to expanded, so the depth-5 folder is visible.
    expect(await screen.findByText("e")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New folder in e" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New document in e" })).toBeInTheDocument();
    // sanity: a depth-4 folder ("d") still allows subfolders.
    expect(screen.getByRole("button", { name: "New folder in d" })).toBeInTheDocument();
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
