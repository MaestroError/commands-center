import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { queryClient } from "@/lib/query-client";

const catalog = {
  builtInSkills: [
    {
      name: "code-reviewer",
      slug: "code-reviewer",
      description: "Review code changes for bugs and style issues.",
      category: "quality",
      version: "1.0.0",
      license: "Apache-2.0",
      compatibility: "opencode",
      metadata: { area: "quality", version: "1.0.0" },
      detailsMarkdown: "## What I do\n- Review code changes",
      files: ["SKILL.md"],
    },
  ],
  workspaceSkills: [],
  mcpServers: [{ name: "github", enabled: true }],
  appMcpServers: [],
  customTools: [
    { slug: "custom_write", name: "custom_write", description: "Write output.", enabled: true },
  ],
  providerModels: [{ id: "openai/gpt-4.1", label: "openai/gpt-4.1" }],
};

const agents = [
  {
    id: "agent-1",
    slug: "writer",
    name: "Writer",
    role: "write docs",
    instructions: "Write clear docs.",
    defaultModel: "openai/gpt-4.1",
    workspacePath: "/tmp/specialists/writer",
    status: "active",
    capabilities: {
      builtInSkills: ["code-reviewer"],
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
  {
    id: "agent-2",
    slug: "reviewer",
    name: "Reviewer",
    role: "review code",
    instructions: "Review diffs.",
    defaultModel: "openai/gpt-4.1",
    workspacePath: "/tmp/specialists/reviewer",
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
];

beforeEach(() => {
  queryClient.clear();
  vi.mocked(window.matchMedia).mockImplementation(
    () =>
      ({
        matches: true,
        media: "",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }) as MediaQueryList,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  queryClient.clear();
});

describe("agent flows", () => {
  it("filters agents by name or role", async () => {
    mockApi({
      "GET /api/specialists": [jsonResponse(200, agents)],
    });
    window.history.replaceState({}, "", "/specialists");
    render(<App />);

    await screen.findByRole("heading", { name: "Writer", level: 2 });
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Search by name or role"), "review");

    expect(screen.queryByRole("heading", { name: "Writer", level: 2 })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reviewer", level: 2 })).toBeInTheDocument();
  });

  it("creates an agent and navigates to the agents page", async () => {
    mockApi({
      "GET /api/specialists/catalog": [jsonResponse(200, catalog), jsonResponse(200, catalog)],
      "GET /api/specialists": [
        jsonResponse(200, agents),
        jsonResponse(200, [
          ...agents,
          {
            ...agents[0],
            id: "agent-3",
            slug: "planner",
            name: "Planner",
            role: "plan work",
            instructions: "Plan before editing.",
            capabilities: {
              builtInSkills: ["code-reviewer"],
              workspaceSkills: [],
              customTools: [],
              mcpServers: [{ name: "github", enabled: true, action: "ask" }],
              toolPermissions: [{ pattern: "custom_write", action: "allow" }],
              appMcpServers: [],
              appToolPermissions: [],
            },
            workspacePath: "/tmp/specialists/planner",
          },
        ]),
      ],
      "GET /api/custom-tools": [jsonResponse(200, []), jsonResponse(200, [])],
      "GET /api/mcp-servers": [jsonResponse(200, []), jsonResponse(200, [])],
      "POST /api/specialists": [
        jsonResponse(201, {
          ...agents[0],
          id: "agent-3",
          slug: "planner",
          name: "Planner",
          role: "plan work",
          instructions: "Plan before editing.",
          capabilities: {
            builtInSkills: ["code-reviewer"],
            workspaceSkills: [],
            customTools: [],
            mcpServers: [{ name: "github", enabled: true, action: "ask" }],
            toolPermissions: [{ pattern: "custom_write", action: "allow" }],
            appMcpServers: [],
            appToolPermissions: [],
          },
          workspacePath: "/tmp/specialists/planner",
        }),
      ],
      "GET /api/specialists/by-slug/planner": [
        jsonResponse(200, {
          ...agents[0],
          id: "agent-3",
          slug: "planner",
          name: "Planner",
          role: "plan work",
          instructions: "Plan before editing.",
          capabilities: {
            builtInSkills: ["code-reviewer"],
            workspaceSkills: [],
            customTools: [],
            mcpServers: [{ name: "github", enabled: true, action: "ask" }],
            toolPermissions: [{ pattern: "custom_write", action: "allow" }],
            appMcpServers: [],
            appToolPermissions: [],
          },
          workspacePath: "/tmp/specialists/planner",
        }),
      ],
      "GET /api/specialists/agent-3/custom-tools": [jsonResponse(200, [])],
    });
    window.history.replaceState({}, "", "/specialists/new");
    render(<App />);

    const user = userEvent.setup();
    await screen.findByLabelText(/Name/i);
    await user.type(screen.getByLabelText(/Name/i), "Planner");
    expect(screen.getByTestId("agent-slug-preview")).toHaveTextContent("Identifier: planner");
    await user.type(screen.getByLabelText(/Role/i), "plan work");
    await user.type(screen.getByLabelText(/Instructions/i), "Plan before editing.");
    await user.click(screen.getByLabelText(/^Model/i));
    await user.click(screen.getByRole("option", { name: "openai/gpt-4.1" }));
    await user.type(screen.getByLabelText(/Search skills/i), "code-reviewer");
    await user.click(screen.getByText("code-reviewer"));
    await user.click(screen.getByRole("button", { name: "Create agent" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/specialists");
    });
    expect(screen.getByRole("heading", { name: "Planner", level: 2 })).toBeInTheDocument();
  });

  it("renders the built-in skills browser and detail pane", async () => {
    mockApi({
      "GET /api/specialists/catalog": [jsonResponse(200, catalog)],
      "GET /api/specialists": [jsonResponse(200, agents)],
      "GET /api/custom-tools": [jsonResponse(200, [])],
    });
    window.history.replaceState({}, "", "/skills");
    render(<App />);

    await screen.findAllByText("code-reviewer");
    expect(
      screen.getAllByText("Review code changes for bugs and style issues.").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("quality").length).toBeGreaterThan(0);
  });

  it("shows a duplicate identifier error before submit", async () => {
    mockApi({
      "GET /api/specialists": [jsonResponse(200, agents)],
      "GET /api/specialists/catalog": [jsonResponse(200, catalog)],
      "GET /api/custom-tools": [jsonResponse(200, [])],
      "GET /api/mcp-servers": [jsonResponse(200, [])],
    });
    window.history.replaceState({}, "", "/specialists/new");
    render(<App />);

    const user = userEvent.setup();
    await screen.findByLabelText(/Name/i);
    await user.type(screen.getByLabelText(/Name/i), "Writer");
    await user.click(screen.getByRole("button", { name: "Create agent" }));

    expect(screen.getByText("Identifier 'writer' is already in use.")).toBeInTheDocument();
  });
});

function mockApi(routes: Record<string, Response[]>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if (typeof input !== "string") {
      return Promise.reject(new Error("Unexpected request object."));
    }

    if (input === "/api/opencode") {
      return Promise.resolve(jsonResponse(200, { state: "healthy" }));
    }

    if (input === "/api/auth/status") {
      return Promise.resolve(jsonResponse(200, { status: "claimed-authenticated" }));
    }

    if (input === "/api/tasks/runs/active") {
      return Promise.resolve(jsonResponse(200, []));
    }

    const key = `${init?.method ?? "GET"} ${input}`;
    const responses = routes[key];

    if (!responses || responses.length === 0) {
      return Promise.reject(new Error(`Unexpected fetch URL: ${key}`));
    }

    const next = responses.shift();

    if (!next) {
      throw new Error(`No mocked response left for ${key}.`);
    }

    return Promise.resolve(next);
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
