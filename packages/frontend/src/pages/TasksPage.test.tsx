import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskDetailPage } from "@/pages/TaskDetailPage";
import { TasksPage } from "@/pages/TasksPage";

const agent = {
  id: "agent-1",
  slug: "planner",
  name: "Planner",
  role: "Plans work",
  instructions: "Plan carefully.",
  defaultModel: "openai/gpt-4.1",
  workspacePath: "/tmp/planner",
  status: "active",
  capabilities: { builtInSkills: [], mcpServers: [], toolPermissions: [] },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const task = {
  id: "task-1",
  agentId: "agent-1",
  title: "Ship release",
  description: "Prepare release notes.",
  context: "Use changelog.",
  todos: [
    {
      id: "todo-1",
      content: "Read changelog",
      status: "pending",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  status: "enabled",
  triggerMode: "manual",
  schedule: { mode: "manual" },
  enabled: true,
  archived: false,
  latestResultSummary: "Ready to publish.",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const run = {
  id: "run-1",
  taskId: "task-1",
  agentId: "agent-1",
  opencodeSessionId: "session-1",
  status: "completed",
  triggerSource: "manual",
  renderedPrompt: "Task: Ship release",
  renderedContext: { taskTitle: "Ship release" },
  effectivePermissions: { toolPermissions: [{ pattern: "bash_*", action: "allow" }] },
  resultSummary: "Done.",
  result: { messageCount: 2 },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TasksPage", () => {
  it("lists tasks and supports manual trigger", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    await screen.findByRole("link", { name: "Ship release" });
    expect(screen.getAllByText("Planner").length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Run now" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/trigger",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("creates a task from the form", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage mode="create" />, "/tasks/new");

    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: /Assigned agent/i });
    await user.type(screen.getByLabelText(/Title/i), "Nightly review");
    await user.selectOptions(screen.getByLabelText(/Assigned agent/i), "agent-1");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

describe("TaskDetailPage", () => {
  it("shows task run inspection details", async () => {
    mockFetch();

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    await screen.findByText("Task: Ship release");
    expect(screen.getByText(/bash_/)).toBeInTheDocument();
    expect(screen.getByText("session-1")).toBeInTheDocument();
  });
});

function renderWithRouter(element: React.ReactElement, initialPath: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={element} path="/tasks" />
          <Route element={element} path="/tasks/new" />
          <Route element={element} path="/tasks/:id/runs/:runId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();

    if (url === "/api/agents") return Promise.resolve(jsonResponse(200, [agent]));
    if (url === "/api/tasks") {
      const method = input instanceof Request ? input.method : init?.method;
      return Promise.resolve(
        method === "POST"
          ? jsonResponse(201, { ...task, id: "task-2", title: "Nightly review" })
          : jsonResponse(200, [task]),
      );
    }
    if (url.startsWith("/api/tasks?")) return Promise.resolve(jsonResponse(200, [task]));
    if (url === "/api/tasks/task-1") return Promise.resolve(jsonResponse(200, task));
    if (url === "/api/tasks/task-1/runs") return Promise.resolve(jsonResponse(200, [run]));
    if (url === "/api/tasks/task-1/runs/run-1") return Promise.resolve(jsonResponse(200, run));
    if (url === "/api/tasks/task-1/runs/run-1/session") {
      return Promise.resolve(jsonResponse(200, { run, diagnostics: [], canOpenInChat: true }));
    }
    if (url === "/api/tasks/task-1/trigger") return Promise.resolve(jsonResponse(200, run));
    return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
