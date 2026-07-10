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
import { getDocumentContent, saveDocumentContent, type DocumentRequestIdentity } from "@/lib/api";

function doc(overrides: Partial<Awaited<ReturnType<typeof getDocumentContent>>> = {}) {
  return {
    scope: "global" as const,
    ownerSlug: null,
    ownerSpecialistId: null,
    relativePath: "notes.md",
    fullPath: "/workspace/Documents/notes.md",
    title: "Notes",
    description: "Project notes",
    author: "operator",
    content: "# Hello World",
    revision: { mtimeMs: 1700000000000, sizeBytes: 13 },
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
    ...overrides,
  };
}

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
    vi.mocked(getDocumentContent).mockResolvedValue(doc());

    renderPage(["/documents?path=notes.md"]);

    const editorPanel = await screen.findByTestId("document-editor-panel");
    expect(editorPanel).toBeInTheDocument();
    expect(within(editorPanel).getByText("Notes")).toBeInTheDocument();
    expect(within(editorPanel).getByRole("button", { name: /Save/i })).toBeDisabled();
    expect(getDocumentContent).toHaveBeenCalledWith({
      scope: "global",
      ownerSlug: null,
      path: "notes.md",
    });
  });

  it("loads a private document from scoped URL parameters", async () => {
    vi.mocked(getDocumentContent).mockResolvedValue(
      doc({
        scope: "private",
        ownerSlug: "planner",
        ownerSpecialistId: "agent-planner",
        relativePath: "notes/research.md",
        fullPath: "/workspace/specialists/planner/Documents/notes/research.md",
        title: "Research",
      }),
    );

    renderPage(["/documents?scope=private&owner=planner&path=notes%2Fresearch.md"]);

    const editorPanel = await screen.findByTestId("document-editor-panel");
    expect(within(editorPanel).getByText("Research")).toBeInTheDocument();
    expect(getDocumentContent).toHaveBeenCalledWith({
      scope: "private",
      ownerSlug: "planner",
      path: "notes/research.md",
    });
  });

  it("ignores private document URL parameters without an owner", async () => {
    renderPage(["/documents?scope=private&path=notes%2Fresearch.md"]);

    expect(await screen.findByText("No document selected")).toBeInTheDocument();
    expect(getDocumentContent).not.toHaveBeenCalled();
  });

  it("defaults the context pane to the Actions tab", async () => {
    vi.mocked(getDocumentContent).mockResolvedValue(
      doc({ content: "# Hello", revision: { mtimeMs: 1700000000000, sizeBytes: 7 } }),
    );

    renderPage(["/documents?path=notes.md"]);

    expect(await screen.findByTestId("document-actions-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("document-info-tab")).not.toBeInTheDocument();
  });

  it("shows document info after switching to the Info tab", async () => {
    vi.mocked(getDocumentContent).mockResolvedValue(
      doc({ content: "# Hello", revision: { mtimeMs: 1700000000000, sizeBytes: 7 } }),
    );

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
    vi.mocked(getDocumentContent).mockResolvedValue(doc({ description: null, author: null }));
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
      scope: "global",
      ownerSlug: undefined,
      path: "notes.md",
      content: "",
      expectedRevision: { mtimeMs: 1700000000000, sizeBytes: 13 },
    });
  });

  it("resets the Actions tab fields when switching to a different document", async () => {
    vi.mocked(getDocumentContent).mockImplementation((input: string | DocumentRequestIdentity) =>
      Promise.resolve(
        (typeof input === "string" ? input : input.path) === "second.md"
          ? doc({
              relativePath: "second.md",
              fullPath: "/workspace/Documents/second.md",
              title: "Second Doc",
              description: "Second description",
              author: "author-two",
              content: "# Second",
              revision: { mtimeMs: 1700000003000, sizeBytes: 8 },
              createdAt: 1700000003000,
              updatedAt: 1700000003000,
            })
          : doc({
              description: "First description",
              author: "author-one",
            }),
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
