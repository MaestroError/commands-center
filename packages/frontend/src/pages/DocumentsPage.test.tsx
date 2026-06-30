import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  getDocumentContent: vi.fn(),
  saveDocumentContent: vi.fn(),
  updateDocumentMetadata: vi.fn(),
}));

vi.mock("@/components/documents/LazyMilkdownEditor", () => ({
  LazyMilkdownEditor: (props: { onChange?: (markdown: string) => void }) => (
    <button onClick={() => props.onChange?.("")} type="button">
      Clear editor content
    </button>
  ),
}));

import { DocumentsPage } from "./DocumentsPage";
import { getDocumentContent, saveDocumentContent } from "@/lib/api";

function renderPage(initialEntries: string[] = ["/documents"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/documents" element={<DocumentsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderPageWithNavigation(initialEntries: string[] = ["/documents"]) {
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
                <Link to="/documents?path=second.md">Go to second doc</Link>
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
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DocumentsPage", () => {
  it("shows an empty state prompting to use the sidebar when no document is selected", async () => {
    renderPage();

    expect(await screen.findByText("No document selected")).toBeInTheDocument();
    expect(getDocumentContent).not.toHaveBeenCalled();
  });

  it("shows the editor panel when a document is selected", async () => {
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
    expect(getDocumentContent).toHaveBeenCalledWith("notes.md");
  });

  it("defaults the context pane to the Actions tab", async () => {
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

    expect(await screen.findByTestId("document-actions-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("document-info-tab")).not.toBeInTheDocument();
  });

  it("shows document info after switching to the Info tab", async () => {
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

    const user = userEvent.setup();
    renderPage(["/documents?path=notes.md"]);

    await screen.findByTestId("document-actions-tab");
    await user.click(screen.getByRole("tab", { name: "Info" }));

    const infoTab = await screen.findByTestId("document-info-tab");
    expect(within(infoTab).getByText("notes.md")).toBeInTheDocument();
    expect(within(infoTab).getByText("/workspace/Documents/notes.md")).toBeInTheDocument();
    expect(within(infoTab).getByText("Project notes")).toBeInTheDocument();
    expect(within(infoTab).getByText("operator")).toBeInTheDocument();
  });

  it("allows saving after the editor content is cleared to an empty string", async () => {
    vi.mocked(getDocumentContent).mockResolvedValue({
      relativePath: "notes.md",
      fullPath: "/workspace/Documents/notes.md",
      title: "Notes",
      description: null,
      author: null,
      content: "# Hello World",
      revision: { mtimeMs: 1700000000000, sizeBytes: 13 },
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
    });
    vi.mocked(saveDocumentContent).mockResolvedValue({
      revision: { mtimeMs: 1700000002000, sizeBytes: 0 },
    });

    const user = userEvent.setup();
    renderPage(["/documents?path=notes.md"]);

    const editorPanel = await screen.findByTestId("document-editor-panel");
    await user.click(screen.getByRole("button", { name: "Clear editor content" }));

    const saveButton = within(editorPanel).getByRole("button", { name: /Save/i });
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    expect(saveDocumentContent).toHaveBeenCalled();
    expect(vi.mocked(saveDocumentContent).mock.calls[0]?.[0]).toEqual({
      path: "notes.md",
      content: "",
      expectedRevision: { mtimeMs: 1700000000000, sizeBytes: 13 },
    });
  });

  it("resets the Actions tab fields when switching to a different document", async () => {
    vi.mocked(getDocumentContent).mockImplementation((path: string) =>
      Promise.resolve(
        path === "second.md"
          ? {
              relativePath: "second.md",
              fullPath: "/workspace/Documents/second.md",
              title: "Second Doc",
              description: "Second description",
              author: "author-two",
              content: "# Second",
              revision: { mtimeMs: 1700000003000, sizeBytes: 8 },
              createdAt: 1700000003000,
              updatedAt: 1700000003000,
            }
          : {
              relativePath: "notes.md",
              fullPath: "/workspace/Documents/notes.md",
              title: "Notes",
              description: "First description",
              author: "author-one",
              content: "# Hello World",
              revision: { mtimeMs: 1700000000000, sizeBytes: 13 },
              createdAt: 1700000000000,
              updatedAt: 1700000001000,
            },
      ),
    );

    const user = userEvent.setup();
    renderPageWithNavigation(["/documents?path=notes.md"]);

    const actionsTab = await screen.findByTestId("document-actions-tab");
    expect(within(actionsTab).getByDisplayValue("Notes")).toBeInTheDocument();
    expect(within(actionsTab).getByDisplayValue("First description")).toBeInTheDocument();
    expect(within(actionsTab).getByDisplayValue("author-one")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Go to second doc" }));

    const refreshedActionsTab = await screen.findByTestId("document-actions-tab");
    expect(within(refreshedActionsTab).getByDisplayValue("Second Doc")).toBeInTheDocument();
    expect(within(refreshedActionsTab).getByDisplayValue("Second description")).toBeInTheDocument();
    expect(within(refreshedActionsTab).getByDisplayValue("author-two")).toBeInTheDocument();
    expect(within(refreshedActionsTab).queryByDisplayValue("Notes")).not.toBeInTheDocument();
  });
});
