import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  searchWorkspaceFiles: vi.fn(),
}));

import { WorkspaceFilePickerDialog } from "./WorkspaceFilePickerDialog";
import { searchWorkspaceFiles } from "@/lib/api";

function renderDialog(onSelect = vi.fn(), onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceFilePickerDialog onClose={onClose} onSelect={onSelect} />
    </QueryClientProvider>,
  );
  return onSelect;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WorkspaceFilePickerDialog", () => {
  it("searches the workspace and labels images vs links", async () => {
    vi.mocked(searchWorkspaceFiles).mockResolvedValue({
      nameMatches: [
        { path: "tools/researcher/diagram.png" },
        { path: "tools/researcher/report.pdf" },
      ],
      contentMatches: [],
      documentMatches: [],
    });

    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByRole("textbox", { name: "Search workspace files" }), "researcher");

    expect(await screen.findByText("tools/researcher/diagram.png")).toBeInTheDocument();
    expect(screen.getByText("tools/researcher/report.pdf")).toBeInTheDocument();
    expect(screen.getByText("Image")).toBeInTheDocument();
    expect(screen.getByText("Link")).toBeInTheDocument();
    expect(searchWorkspaceFiles).toHaveBeenCalledWith("researcher");
  });

  it("calls onSelect with the chosen path", async () => {
    vi.mocked(searchWorkspaceFiles).mockResolvedValue({
      nameMatches: [{ path: "tools/researcher/diagram.png" }],
      contentMatches: [],
      documentMatches: [],
    });

    const user = userEvent.setup();
    const onSelect = renderDialog();

    await user.type(screen.getByRole("textbox", { name: "Search workspace files" }), "diagram");
    await user.click(await screen.findByText("tools/researcher/diagram.png"));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith("tools/researcher/diagram.png");
    });
  });

  it("shows guidance before searching and an empty state when nothing matches", async () => {
    vi.mocked(searchWorkspaceFiles).mockResolvedValue({
      nameMatches: [],
      contentMatches: [],
      documentMatches: [],
    });

    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByText(/Type to search files/i)).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Search workspace files" }), "nope");
    expect(await screen.findByText("No files found.")).toBeInTheDocument();
  });

  it("closes on Escape from the search field", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog(vi.fn(), onClose);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on overlay click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog(vi.fn(), onClose);

    const overlay = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
