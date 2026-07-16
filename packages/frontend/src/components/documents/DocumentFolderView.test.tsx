import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  getDocumentFolder: vi.fn(),
}));

import { DocumentFolderView } from "./DocumentFolderView";
import { getDocumentFolder } from "@/lib/api";
import type { DocumentFolderListingResponse } from "@cc/shared/schemas";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

function renderView(path = "design") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/documents?folder=${path}`]}>
        <Routes>
          <Route
            path="/documents"
            element={
              <>
                <DocumentFolderView scope="global" ownerSlug={null} path={path} />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function listing(
  entries: DocumentFolderListingResponse["entries"],
  path = "design",
): DocumentFolderListingResponse {
  return { scope: "global", ownerSlug: null, path, entries };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DocumentFolderView", () => {
  it("renders filenames for every entry, including non-markdown files", async () => {
    vi.mocked(getDocumentFolder).mockResolvedValue(
      listing([
        {
          scope: "global",
          ownerSlug: null,
          ownerSpecialistId: null,
          name: "sub",
          relativePath: "design/sub",
          type: "directory",
          isDocument: false,
          title: null,
        },
        {
          scope: "global",
          ownerSlug: null,
          ownerSpecialistId: null,
          name: "diagram.png",
          relativePath: "design/diagram.png",
          type: "file",
          isDocument: false,
          title: null,
        },
        {
          scope: "global",
          ownerSlug: null,
          ownerSpecialistId: null,
          name: "overview.md",
          relativePath: "design/overview.md",
          type: "file",
          isDocument: true,
          title: "Overview",
        },
      ]),
    );

    renderView();

    // Filenames, not titles.
    expect(await screen.findByText("overview.md")).toBeInTheDocument();
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    expect(screen.getByText("diagram.png")).toBeInTheDocument();
    expect(screen.getByText("sub")).toBeInTheDocument();
  });

  it("opens a subfolder as a folder view and a document as an editor path", async () => {
    vi.mocked(getDocumentFolder).mockResolvedValue(
      listing([
        {
          scope: "global",
          ownerSlug: null,
          ownerSpecialistId: null,
          name: "sub",
          relativePath: "design/sub",
          type: "directory",
          isDocument: false,
          title: null,
        },
        {
          scope: "global",
          ownerSlug: null,
          ownerSpecialistId: null,
          name: "overview.md",
          relativePath: "design/overview.md",
          type: "file",
          isDocument: true,
          title: "Overview",
        },
      ]),
    );

    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByText("sub"));
    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent(
        "/documents?folder=design%2Fsub",
      );
    });

    await user.click(screen.getByText("overview.md"));
    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent(
        "/documents?path=design%2Foverview.md",
      );
    });
  });

  it("does not make non-markdown files openable but exposes a File Manager link", async () => {
    vi.mocked(getDocumentFolder).mockResolvedValue(
      listing([
        {
          scope: "global",
          ownerSlug: null,
          ownerSpecialistId: null,
          name: "diagram.png",
          relativePath: "design/diagram.png",
          type: "file",
          isDocument: false,
          title: null,
        },
      ]),
    );

    renderView();

    // The filename is present but is not a link/button (no default open action).
    const name = await screen.findByText("diagram.png");
    expect(name.closest("a")).toBeNull();
    expect(name.closest("button")).toBeNull();

    const reveal = screen.getByRole("link", { name: "Show diagram.png in File Manager" });
    expect(reveal).toHaveAttribute(
      "href",
      "/files?root=workspace&path=Documents%2Fdesign&select=Documents%2Fdesign%2Fdiagram.png",
    );
  });

  it("shows an empty state for an empty folder", async () => {
    vi.mocked(getDocumentFolder).mockResolvedValue(listing([]));

    renderView();

    expect(await screen.findByText("This folder is empty.")).toBeInTheDocument();
  });
});
