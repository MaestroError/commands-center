import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SessionSettingsTab } from "./SessionSettingsTab";

import { useAgentCatalogQuery, useAgentMutations, useAgentQuery } from "@/hooks/use-agents-query";

vi.mock("@/hooks/use-agents-query", () => ({
  useAgentQuery: vi.fn(),
  useAgentCatalogQuery: vi.fn(),
  useAgentMutations: vi.fn(),
}));

const mutateAsync = vi.fn();

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: "agent-1",
    slug: "planner",
    name: "Planner",
    role: "Plans work",
    instructions: "Do the planning.",
    defaultModel: "openai/gpt-4.1",
    iconPath: "/icon.png",
    workspacePath: "/workspace",
    status: "active",
    capabilities: { builtInSkills: ["plan"], mcpServers: [], toolPermissions: [] },
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-22T10:00:00.000Z",
    ...overrides,
  };
}

function makeCatalog(overrides: Record<string, unknown> = {}) {
  return {
    builtInSkills: [],
    providerModels: [
      { id: "openai/gpt-4.1", label: "GPT-4.1" },
      { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
    ],
    mcpServers: [],
    customTools: [],
    ...overrides,
  };
}

function renderTab() {
  return render(
    <MemoryRouter>
      <SessionSettingsTab agentSlug="planner" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mutateAsync.mockReset();
  vi.mocked(useAgentQuery).mockReturnValue({
    data: makeAgent(),
    isLoading: false,
    error: null,
  } as never);
  vi.mocked(useAgentCatalogQuery).mockReturnValue({
    data: makeCatalog(),
    isLoading: false,
    error: null,
  } as never);
  vi.mocked(useAgentMutations).mockReturnValue({
    update: {
      mutateAsync,
      isPending: false,
    },
  } as never);
});

describe("SessionSettingsTab", () => {
  it("renders loading state while queries are loading", () => {
    vi.mocked(useAgentQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never);

    const { container } = renderTab();

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(6);
  });

  it("renders read-only model, role, and instructions by default", () => {
    renderTab();

    expect(screen.getByText("Planner")).toBeInTheDocument();
    expect(screen.getByText("GPT-4.1")).toBeInTheDocument();
    expect(screen.getByText("Plans work")).toBeInTheDocument();
    expect(screen.getByText("Do the planning.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit agent settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open full agent editor" })).toHaveAttribute(
      "href",
      "/agents/planner/edit",
    );
  });

  it("enters edit mode and cancels back to the last saved values", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.click(screen.getByRole("button", { name: "Edit agent settings" }));
    await user.clear(screen.getByRole("textbox", { name: /Role/i }));
    await user.type(screen.getByRole("textbox", { name: /Role/i }), "Changed role");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Plans work")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Changed role")).not.toBeInTheDocument();
  });

  it("shows inline validation errors for empty fields", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.click(screen.getByRole("button", { name: "Edit agent settings" }));
    await user.selectOptions(screen.getByRole("combobox", { name: /Model/i }), "");
    await user.clear(screen.getByRole("textbox", { name: /Role/i }));
    await user.clear(screen.getByRole("textbox", { name: /Instructions/i }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("A default model is required.")).toBeInTheDocument();
    expect(screen.getByText("Role is required.")).toBeInTheDocument();
    expect(screen.getByText("Instructions are required.")).toBeInTheDocument();
  });

  it("saves with preserved non-editable agent fields and clears the success flash", async () => {
    mutateAsync.mockResolvedValue(
      makeAgent({ role: "Updated role", updatedAt: "2026-04-22T11:00:00.000Z" }),
    );
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: "Edit agent settings" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Role/i }), {
      target: { value: "Updated role" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        id: "agent-1",
        input: {
          name: "Planner",
          iconPath: "/icon.png",
          capabilities: { builtInSkills: ["plan"], mcpServers: [], toolPermissions: [] },
          defaultModel: "openai/gpt-4.1",
          role: "Updated role",
          instructions: "Do the planning.",
        },
      });
    });

    expect(screen.getByText("Saved.")).toBeInTheDocument();
  });

  it("does not overwrite in-progress edits when agent data refetches", () => {
    const { rerender } = renderTab();

    fireEvent.click(screen.getByRole("button", { name: "Edit agent settings" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Role/i }), {
      target: { value: "Draft role" },
    });

    vi.mocked(useAgentQuery).mockReturnValue({
      data: makeAgent({ role: "Server role", updatedAt: "2026-04-22T12:00:00.000Z" }),
      isLoading: false,
      error: null,
    } as never);

    rerender(
      <MemoryRouter>
        <SessionSettingsTab agentSlug="planner" />
      </MemoryRouter>,
    );

    expect(screen.getByDisplayValue("Draft role")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Server role")).not.toBeInTheDocument();
  });

  it("shows manage providers guidance when no provider models are connected", () => {
    vi.mocked(useAgentCatalogQuery).mockReturnValue({
      data: makeCatalog({ providerModels: [] }),
      isLoading: false,
      error: null,
    } as never);

    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Edit agent settings" }));

    expect(screen.getByText(/No connected models/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage providers" })).toBeInTheDocument();
  });
});
