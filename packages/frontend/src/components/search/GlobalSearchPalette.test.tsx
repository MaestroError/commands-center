import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  listAgents: vi.fn(),
  searchWorkspaceFiles: vi.fn(),
}));

import { GlobalSearchPalette } from "./GlobalSearchPalette";

import { listAgents, searchWorkspaceFiles } from "@/lib/api";

describe("GlobalSearchPalette", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders icon-only file secondary actions and routes them correctly", async () => {
    vi.mocked(listAgents).mockResolvedValue([
      {
        id: "agent-1",
        slug: "planner",
        name: "Planner",
        role: "Plans work",
        instructions: "Plan work.",
        defaultModel: "openai/gpt-4.1",
        workspacePath: "/tmp/planner",
        status: "active",
        capabilities: { builtInSkills: [], mcpServers: [], toolPermissions: [] },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    vi.mocked(searchWorkspaceFiles).mockResolvedValue({
      nameMatches: [{ path: "src/index.ts" }],
      contentMatches: [],
    });

    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route
          element={
            <>
              <GlobalSearchPalette onClose={() => undefined} open />
              <LocationProbe />
            </>
          }
          path="*"
        />
      </Routes>,
      ["/"],
    );

    await user.type(screen.getByRole("textbox", { name: "Search resources" }), "index");

    await screen.findByText((_, element) => element?.textContent === "src/index.ts");
    expect(screen.queryByText("Show file location")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit file")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show file location" }));

    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent(
        "/files?root=workspace&path=src&select=src%2Findex.ts",
      );
    });
  });
});

function renderWithProviders(element: React.ReactNode, initialEntries: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}
