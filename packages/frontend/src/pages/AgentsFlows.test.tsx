import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { queryClient } from "@/lib/query-client";

const catalog = {
  builtInSkills: [
    {
      name: "screen-requirements-writing",
      slug: "screen-requirements-writing",
      description: "Create screen requirement documents.",
      category: "design-docs",
      version: "1.0.0",
      license: "MIT",
      compatibility: "opencode",
      metadata: { area: "design-docs", version: "1.0.0" },
      detailsMarkdown: "## What I do\n- Create screen docs",
      files: ["SKILL.md"],
    },
  ],
  mcpServers: [{ name: "github", enabled: true }],
  customTools: [{ name: "custom_write", enabled: true }],
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
    workspacePath: "/tmp/agents/writer",
    status: "active",
    capabilities: {
      builtInSkills: ["screen-requirements-writing"],
      mcpServers: [],
      toolPermissions: [],
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
    workspacePath: "/tmp/agents/reviewer",
    status: "active",
    capabilities: { builtInSkills: [], mcpServers: [], toolPermissions: [] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

beforeEach(() => {
  queryClient.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
});

describe("agent flows", () => {
  it("filters agents by name or role", async () => {
    mockApi({
      "GET /api/agents": [jsonResponse(200, agents)],
    });
    window.history.replaceState({}, "", "/agents");
    render(<App />);

    await screen.findByRole("heading", { name: "Writer", level: 2 });
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Search by name or role"), "review");

    expect(screen.queryByRole("heading", { name: "Writer", level: 2 })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reviewer", level: 2 })).toBeInTheDocument();
  });

  it("creates an agent and navigates to edit state", async () => {
    mockApi({
      "GET /api/agents/catalog": [jsonResponse(200, catalog), jsonResponse(200, catalog)],
      "POST /api/agents": [
        jsonResponse(201, {
          ...agents[0],
          id: "agent-3",
          slug: "planner",
          name: "Planner",
          role: "plan work",
          instructions: "Plan before editing.",
          capabilities: {
            builtInSkills: ["screen-requirements-writing"],
            mcpServers: [{ name: "github", enabled: true, action: "ask" }],
            toolPermissions: [{ pattern: "custom_write", action: "allow" }],
          },
          workspacePath: "/tmp/agents/planner",
        }),
      ],
      "GET /api/agents/by-slug/planner": [
        jsonResponse(200, {
          ...agents[0],
          id: "agent-3",
          slug: "planner",
          name: "Planner",
          role: "plan work",
          instructions: "Plan before editing.",
          capabilities: {
            builtInSkills: ["screen-requirements-writing"],
            mcpServers: [{ name: "github", enabled: true, action: "ask" }],
            toolPermissions: [{ pattern: "custom_write", action: "allow" }],
          },
          workspacePath: "/tmp/agents/planner",
        }),
      ],
    });
    window.history.replaceState({}, "", "/agents/new");
    render(<App />);

    const user = userEvent.setup();
    await screen.findByLabelText(/Name/i);
    await user.type(screen.getByLabelText(/Name/i), "Planner");
    await user.type(screen.getByLabelText(/Role/i), "plan work");
    await user.type(screen.getByLabelText(/Instructions/i), "Plan before editing.");
    await user.selectOptions(screen.getByLabelText(/^Model/i), "openai/gpt-4.1");
    await user.click(screen.getByText("screen-requirements-writing"));
    await user.click(screen.getByRole("button", { name: "Create agent" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/agents/planner/edit");
    });
    expect(screen.getByDisplayValue("Planner")).toBeInTheDocument();
  });

  it("renders the built-in skills browser and detail pane", async () => {
    mockApi({
      "GET /api/agents/catalog": [jsonResponse(200, catalog)],
    });
    window.history.replaceState({}, "", "/skills");
    render(<App />);

    await screen.findByText("screen-requirements-writing");
    expect(screen.getByText("Create screen requirement documents.")).toBeInTheDocument();
    expect(screen.getAllByText("design-docs").length).toBeGreaterThan(0);
  });
});

function mockApi(routes: Record<string, Response[]>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if (typeof input !== "string") {
      return Promise.reject(new Error("Unexpected request object."));
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
