import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  getDocumentTree: vi.fn(),
  getDocumentContent: vi.fn(),
  createDocument: vi.fn(),
  createDocumentFolder: vi.fn(),
  updateDocumentMetadata: vi.fn(),
  saveDocumentContent: vi.fn(),
}));

import { DocumentsPage } from "./DocumentsPage";
import { getDocumentTree, getDocumentContent } from "@/lib/api";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(initialEntries: string[] = ["/documents"]) {
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
                <DocumentsPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
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

describe("DocumentsPage", () => {
  it("renders the page header with title and action buttons", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue({ tree: [] });

    renderPage();

    expect(await screen.findByText("Documents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New Document/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New Folder/i })).toBeInTheDocument();
  });

  it("shows empty state when no documents exist", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue({ tree: [] });

    renderPage();

    expect(await screen.findByText("No documents yet")).toBeInTheDocument();
  });

  it("renders a tree with folders and documents", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue({
      tree: [
        {
          name: "design",
          relativePath: "design",
          type: "directory",
          title: null,
          children: [
            {
              name: "overview.md",
              relativePath: "design/overview.md",
              type: "file",
              title: "Architecture Overview",
            },
          ],
        },
        {
          name: "readme.md",
          relativePath: "readme.md",
          type: "file",
          title: "Readme",
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("design")).toBeInTheDocument();
    expect(screen.getByText("Architecture Overview")).toBeInTheDocument();
    expect(screen.getByText("Readme")).toBeInTheDocument();
  });

  it("navigates to document path when a file is clicked", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue({
      tree: [
        {
          name: "notes.md",
          relativePath: "notes.md",
          type: "file",
          title: "Notes",
        },
      ],
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Notes"));

    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent("/documents?path=notes.md");
    });
  });

  it("opens the create document dialog", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue({ tree: [] });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("No documents yet");
    await user.click(screen.getByRole("button", { name: /New Document/i }));

    expect(await screen.findByText("New Document", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("opens the create folder dialog", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue({ tree: [] });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("No documents yet");
    await user.click(screen.getByRole("button", { name: /New Folder/i }));

    expect(await screen.findByText("New Folder", { selector: "h2" })).toBeInTheDocument();
  });

  it("closes the create document dialog on cancel", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue({ tree: [] });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("No documents yet");
    await user.click(screen.getByRole("button", { name: /New Document/i }));
    await screen.findByText("New Document", { selector: "h2" });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByText("New Document", { selector: "h2" })).not.toBeInTheDocument();
    });
  });

  it("shows editor panel when a document is selected", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue({
      tree: [
        {
          name: "notes.md",
          relativePath: "notes.md",
          type: "file",
          title: "Notes",
        },
      ],
    });
    vi.mocked(getDocumentContent).mockResolvedValue({
      relativePath: "notes.md",
      fullPath: "/workspace/Documents/notes.md",
      title: "Notes",
      description: "Project notes",
      author: "operator",
      content: "# Hello World",
      revision: { mtimeMs: 1700000000000, sizeBytes: 13 },
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
    });

    renderPage(["/documents?path=notes.md"]);

    const editorPanel = await screen.findByTestId("document-editor-panel");
    expect(editorPanel).toBeInTheDocument();
    expect(within(editorPanel).getByText("Notes")).toBeInTheDocument();
    expect(within(editorPanel).getByRole("button", { name: /Save/i })).toBeDisabled();
  });

  it("shows document info in the context pane", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue({
      tree: [
        {
          name: "notes.md",
          relativePath: "notes.md",
          type: "file",
          title: "Notes",
        },
      ],
    });
    vi.mocked(getDocumentContent).mockResolvedValue({
      relativePath: "notes.md",
      fullPath: "/workspace/Documents/notes.md",
      title: "Notes",
      description: "Project notes",
      author: "operator",
      content: "# Hello",
      revision: { mtimeMs: 1700000000000, sizeBytes: 7 },
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
    });

    renderPage(["/documents?path=notes.md"]);

    const infoTab = await screen.findByTestId("document-info-tab");
    expect(infoTab).toBeInTheDocument();
    expect(within(infoTab).getByText("notes.md")).toBeInTheDocument();
    expect(within(infoTab).getByText("/workspace/Documents/notes.md")).toBeInTheDocument();
    expect(within(infoTab).getByText("Project notes")).toBeInTheDocument();
    expect(within(infoTab).getByText("operator")).toBeInTheDocument();
  });

  it("collapses and expands folders on click", async () => {
    vi.mocked(getDocumentTree).mockResolvedValue({
      tree: [
        {
          name: "design",
          relativePath: "design",
          type: "directory",
          title: null,
          children: [
            {
              name: "overview.md",
              relativePath: "design/overview.md",
              type: "file",
              title: "Overview",
            },
          ],
        },
      ],
    });

    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Overview")).toBeInTheDocument();

    await user.click(screen.getByText("design"));
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();

    await user.click(screen.getByText("design"));
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });
});
