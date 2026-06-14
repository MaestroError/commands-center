import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  getSpecialistCatalog: vi.fn(),
  listSpecialists: vi.fn(),
  listArchivedTasks: vi.fn(),
  listCustomTools: vi.fn(),
  listTasks: vi.fn(),
  listTaskTemplates: vi.fn(),
  searchWorkspaceFiles: vi.fn(),
}));

import { GlobalSearchPalette } from "./GlobalSearchPalette";

import {
  getSpecialistCatalog,
  listSpecialists,
  listArchivedTasks,
  listCustomTools,
  listTasks,
  listTaskTemplates,
  searchWorkspaceFiles,
} from "@/lib/api";

describe("GlobalSearchPalette", () => {
  beforeEach(() => {
    mockGlobalSearchSources();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders icon-only file secondary actions and routes them correctly", async () => {
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

  it("renders tasks, task templates, custom tools, and skills in global search", async () => {
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

    await user.type(screen.getByRole("textbox", { name: "Search resources" }), "release");

    expect(await screen.findByText("Release checklist")).toBeInTheDocument();
    expect(screen.getByText("Release task template")).toBeInTheDocument();
    expect(screen.getByText("Release helper")).toBeInTheDocument();
    expect(screen.getByText("Release skill")).toBeInTheDocument();
  });

  it("routes task results to the task detail page", async () => {
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

    await user.type(screen.getByRole("textbox", { name: "Search resources" }), "release");
    await user.click(await screen.findByRole("button", { name: /Release checklist/ }));

    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent("/tasks/task-1");
    });
  });

  it("routes custom tool results to the tool source file", async () => {
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

    await user.type(screen.getByRole("textbox", { name: "Search resources" }), "helper");
    await user.click(await screen.findByRole("button", { name: /Release helper/ }));

    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent(
        "/files?root=workspace&path=custom-tools%2Frelease-helper&select=custom-tools%2Frelease-helper%2Ftool.ts",
      );
    });
  });

  it("routes built-in skill results to the selected skill library entry", async () => {
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

    await user.type(screen.getByRole("textbox", { name: "Search resources" }), "skill");
    await user.click(await screen.findByRole("button", { name: /Release skill/ }));

    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent(
        "/skills?skill=built-in%3Arelease-skill",
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

function mockGlobalSearchSources() {
  vi.mocked(listSpecialists).mockResolvedValue([
    {
      id: "agent-1",
      slug: "planner",
      name: "Planner",
      role: "Plans work",
      instructions: "Plan work.",
      defaultModel: "openai/gpt-4.1",
      workspacePath: "/tmp/planner",
      status: "active",
      capabilities: {
        builtInSkills: [],
        workspaceSkills: [],
        customTools: [],
        mcpServers: [],
        toolPermissions: [],
        appMcpServers: [],
        appToolPermissions: [],
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  vi.mocked(listTasks).mockResolvedValue([
    {
      id: "task-1",
      agentId: "agent-1",
      fallbackModels: [],
      title: "Release checklist",
      description: "Prepare the release.",
      context: { attachments: [] },
      todos: [],
      status: "backlog",
      enabled: true,
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  vi.mocked(listArchivedTasks).mockResolvedValue([]);
  vi.mocked(listTaskTemplates).mockResolvedValue([
    {
      id: "template-1",
      defaultAgentId: "agent-1",
      fallbackModels: [],
      title: "Release task template",
      description: "Repeatable release work.",
      todos: [],
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  vi.mocked(listCustomTools).mockResolvedValue([
    {
      id: "tool-1",
      slug: "release-helper",
      name: "Release helper",
      description: "Drafts release notes.",
      entryFile: "tool.ts",
      entryPath: "custom-tools/release-helper/tool.ts",
      directoryPath: "custom-tools/release-helper",
      fingerprint: "fingerprint",
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      warnings: [],
      usage: [],
    },
  ]);
  vi.mocked(getSpecialistCatalog).mockResolvedValue({
    builtInSkills: [
      {
        name: "Release skill",
        slug: "release-skill",
        description: "Reviews release readiness.",
        category: "delivery",
        metadata: {},
        detailsMarkdown: "Review release readiness.",
        files: [],
      },
    ],
    workspaceSkills: [],
    providerModels: [],
    mcpServers: [],
    appMcpServers: [],
    customTools: [],
  });
  vi.mocked(searchWorkspaceFiles).mockResolvedValue({ nameMatches: [], contentMatches: [] });
}
