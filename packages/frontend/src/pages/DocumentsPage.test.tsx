import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  getDocumentContent: vi.fn(),
  saveDocumentContent: vi.fn(),
  updateDocumentMetadata: vi.fn(),
}));

import { DocumentsPage } from "./DocumentsPage";
import { getDocumentContent } from "@/lib/api";

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
});
