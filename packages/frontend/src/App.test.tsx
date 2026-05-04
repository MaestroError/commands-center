import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { queryClient } from "@/lib/query-client";
import { RECENT_AGENTS_STORAGE_KEY } from "@/lib/recent-agents";
import { THEME_STORAGE_KEY } from "@/stores/ui-store";

const connectedProvider = {
  provider: {
    id: "openai",
    name: "OpenAI",
    source: "api",
    env: ["OPENAI_API_KEY"],
    models: {
      "openai/gpt-4.1": { name: "GPT-4.1" },
    },
  },
  connected: true,
  defaultModel: "openai/gpt-4.1",
  authMethods: [
    { type: "api", label: "API key" },
    { type: "oauth", label: "Browser OAuth" },
  ],
  models: [{ id: "openai/gpt-4.1", name: "GPT-4.1", providerId: "openai" }],
};

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  resetStorage();
  setDesktopMatchMedia(true);
  queryClient.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  setDesktopMatchMedia(true);
  queryClient.clear();
});

describe("App", () => {
  it("renders the global shell on the dashboard route", () => {
    render(<App />);

    expect(screen.getAllByRole("heading", { name: "Dashboard" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "CommandsCenter" })).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("link", { name: "Agents" })[0]).toHaveAttribute("href", "/agents");
    expect(screen.getByTestId("sidebar-navigation")).toBeInTheDocument();
    expect(screen.queryByText("Frontend foundation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute("href", "/tasks");
    expect(screen.queryByText("Automations")).not.toBeInTheDocument();
    expect(screen.getByText("Provider Connections")).toBeInTheDocument();
    expect(screen.getByTestId("recent-agents-section")).toBeInTheDocument();
  });

  it("collapses the sidebar to icon-only navigation on desktop", async () => {
    render(<App />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.queryByText("Provider Connections")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agents" })).toHaveAttribute("href", "/agents");
    expect(window.localStorage.getItem("cc-sidebar-collapsed")).toBe("true");
  });

  it("opens the navigation drawer on mobile", async () => {
    setDesktopMatchMedia(false);
    render(<App />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open navigation" }));

    expect(screen.getByRole("link", { name: "Integrations" })).toBeInTheDocument();
  });

  it("opens global search from the keyboard shortcut and searches agents and files", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (typeof input !== "string") {
        return Promise.reject(new Error("Unexpected fetch input."));
      }

      if (input === "/api/opencode") {
        return Promise.resolve(jsonResponse(200, { state: "healthy" }));
      }

      if (input === "/api/tasks/runs/active") {
        return Promise.resolve(jsonResponse(200, []));
      }

      if (input === "/api/agents") {
        return Promise.resolve(
          jsonResponse(200, [
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
          ]),
        );
      }

      if (input === "/api/search/files?query=plan") {
        return Promise.resolve(
          jsonResponse(200, {
            nameMatches: [{ path: "docs/planning.md" }],
            contentMatches: [],
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch URL: ${input}`));
    });

    render(<App />);

    fireEvent.keyDown(window, { key: "F", metaKey: true, shiftKey: true });

    const input = await screen.findByRole("textbox", { name: "Search resources" });
    expect(screen.getByRole("dialog", { name: "Global search" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(input, "plan");

    await screen.findByText("Planner");
    await screen.findByText((_, element) => element?.textContent === "docs/planning.md");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/agents",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/search/files?query=plan",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("shows up to three recent agents in the expanded agents section", () => {
    window.localStorage.setItem(
      RECENT_AGENTS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "a1",
          slug: "planner",
          name: "Planner",
          role: "Plans",
          iconPath: "emoji:🤖",
          lastVisitedAt: "1",
        },
        { id: "a2", slug: "reviewer", name: "Reviewer", role: "Reviews", lastVisitedAt: "2" },
        { id: "a3", slug: "builder", name: "Builder", role: "Builds", lastVisitedAt: "3" },
        { id: "a4", slug: "extra", name: "Extra", role: "Extra", lastVisitedAt: "4" },
      ]),
    );

    render(<App />);

    expect(screen.getByRole("link", { name: "🤖 Planner Plans" })).toHaveAttribute(
      "href",
      "/chat/planner",
    );
    expect(screen.getByRole("link", { name: "R Reviewer Reviews" })).toHaveAttribute(
      "href",
      "/chat/reviewer",
    );
    expect(screen.getByRole("link", { name: "B Builder Builds" })).toHaveAttribute(
      "href",
      "/chat/builder",
    );
    expect(screen.queryByRole("link", { name: "Extra Extra" })).not.toBeInTheDocument();
    expect(screen.getByText("🤖")).toBeInTheDocument();
  });

  it("updates active navigation and header title when navigating", async () => {
    mockFetch([jsonResponse(200, [connectedProvider])]);

    render(<App />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "Provider Connections" }));

    await screen.findByRole("heading", { name: "OpenAI", level: 2 });
    expect(screen.getByRole("heading", { name: "Provider Connections" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/providers");
  });

  it("persists theme selection from the profile page", async () => {
    render(<App />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "Profile" }));
    await user.click(screen.getByRole("button", { name: "modern" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("modern");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("modern");
  });

  it("loads providers inside the new shell", async () => {
    mockFetch([jsonResponse(200, [connectedProvider])]);

    window.history.replaceState({}, "", "/providers");
    render(<App />);

    await screen.findByRole("heading", { name: "OpenAI", level: 2 });
    expect(screen.getByText("1 connected model")).toBeInTheDocument();
    expect(screen.getAllByText("GPT-4.1").length).toBeGreaterThan(0);
  });

  it("submits API keys from the provider dialog", async () => {
    const fetchMock = mockFetch([
      jsonResponse(200, [{ ...connectedProvider, connected: false }]),
      jsonResponse(200, { success: true }),
      jsonResponse(200, [connectedProvider]),
    ]);

    window.history.replaceState({}, "", "/providers");
    render(<App />);

    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "OpenAI", level: 2 });
    await user.click(screen.getByRole("button", { name: /Connect API key/i }));
    await user.type(screen.getByLabelText("API key"), "sk-test");
    await user.click(screen.getByRole("button", { name: /Save key/i }));

    await screen.findByText("Provider connected successfully");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/providers/openai/api-key",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  it("starts and completes OAuth flows", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const fetchMock = mockFetch([
      jsonResponse(200, [{ ...connectedProvider, connected: false }]),
      jsonResponse(200, {
        url: "https://provider.example/oauth",
        method: "code",
        instructions: "Complete login in the browser, then paste the code here.",
      }),
      jsonResponse(200, { connected: true, pending: false, message: "Connected openai" }),
      jsonResponse(200, [connectedProvider]),
    ]);

    window.history.replaceState({}, "", "/providers");
    render(<App />);

    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "OpenAI", level: 2 });
    await user.click(screen.getByRole("button", { name: /Connect OAuth/i }));
    await user.click(screen.getByRole("button", { name: /Open provider login/i }));
    await screen.findByText(/OAuth session started/i);
    await user.type(screen.getByLabelText(/Manual code or callback value/i), "oauth-code");
    await user.click(screen.getByRole("button", { name: /Complete OAuth/i }));

    await screen.findByText("Provider connected successfully");

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        "https://provider.example/oauth",
        "_blank",
        "noopener,noreferrer",
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/providers/openai/oauth/complete",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

function mockFetch(responses: Response[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    if (typeof input === "string" && input === "/api/opencode") {
      return Promise.resolve(jsonResponse(200, { state: "healthy" }));
    }

    if (typeof input === "string" && input === "/api/tasks/runs/active") {
      return Promise.resolve(jsonResponse(200, []));
    }

    if (typeof input === "string" && !input.startsWith("/api/providers")) {
      return Promise.reject(new Error(`Unexpected fetch URL: ${input}`));
    }

    const next = responses.shift();

    if (!next) {
      throw new Error("No mocked response left.");
    }

    return Promise.resolve(next);
  });
}

function resetStorage() {
  if (typeof window.localStorage?.clear === "function") {
    window.localStorage.clear();
    return;
  }

  if (typeof window.localStorage?.removeItem === "function") {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    window.localStorage.removeItem(RECENT_AGENTS_STORAGE_KEY);
    window.localStorage.removeItem("cc-sidebar-collapsed");
  }
}

function setDesktopMatchMedia(matches: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(
    () =>
      ({
        matches,
        media: "",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }) as MediaQueryList,
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}
