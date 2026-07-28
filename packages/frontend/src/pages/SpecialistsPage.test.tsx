import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Specialist } from "@cc/shared/schemas";

import { SpecialistsPage } from "./SpecialistsPage";

const mockUseSpecialistsQuery = vi.fn<() => unknown>();
const mockArchiveMutateAsync = vi.fn();

vi.mock("@/hooks/use-specialists-query", () => ({
  useSpecialistsQuery: () => mockUseSpecialistsQuery(),
  useSpecialistMutations: () => ({
    archive: { mutateAsync: mockArchiveMutateAsync },
  }),
}));

function buildSpecialist(overrides: Partial<Specialist> = {}): Specialist {
  return {
    id: "agent-1",
    slug: "reviewer",
    name: "Reviewer",
    role: "Reviews code",
    instructions: "Be thorough.",
    defaultModel: "anthropic/claude",
    iconPath: undefined,
    capabilities: { builtInSkills: ["read"], workspaceSkills: [] },
    ...overrides,
  } as Specialist;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SpecialistsPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("SpecialistsPage", () => {
  it("shows the error state and refetches on retry", async () => {
    const refetch = vi.fn();
    mockUseSpecialistsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
      refetch,
    });

    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText("boom")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the empty state when there are no specialists", () => {
    mockUseSpecialistsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText("Create your first specialist")).toBeInTheDocument();
  });

  it("shows a no-match state when the search filters everything out", async () => {
    mockUseSpecialistsQuery.mockReturnValue({
      data: [buildSpecialist()],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Search by name or role"), "zzz");

    await waitFor(() => {
      expect(screen.getByText("No specialists match this search")).toBeInTheDocument();
    });
  });

  it("archives a specialist through the delete confirmation modal", async () => {
    mockUseSpecialistsQuery.mockReturnValue({
      data: [buildSpecialist()],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockArchiveMutateAsync.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete Reviewer?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => {
      expect(mockArchiveMutateAsync).toHaveBeenCalledWith("agent-1");
    });
    await waitFor(() => {
      expect(screen.queryByText("Delete Reviewer?")).not.toBeInTheDocument();
    });
  });

  it("dismisses the delete modal with Cancel", async () => {
    mockUseSpecialistsQuery.mockReturnValue({
      data: [buildSpecialist()],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Delete Reviewer?")).not.toBeInTheDocument();
    expect(mockArchiveMutateAsync).not.toHaveBeenCalled();
  });
});
