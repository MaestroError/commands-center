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
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    if (input === "/api/auth/status") {
      return Promise.resolve(jsonResponse(200, { status: "claimed-authenticated" }));
    }

    if (input === "/api/auth/logout") {
      return Promise.resolve(jsonResponse(200, { status: "claimed-unauthenticated" }));
    }

    if (input === "/api/opencode") {
      return Promise.resolve(jsonResponse(200, { state: "healthy" }));
    }

    if (input === "/api/tasks/runs/active") {
      return Promise.resolve(jsonResponse(200, []));
    }

    if (input === "/api/system/version") {
      return Promise.resolve(jsonResponse(200, systemVersionPayload()));
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${describeFetchInput(input)}`));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  setDesktopMatchMedia(true);
  queryClient.clear();
});

describe("App", () => {
  it("renders the global shell on the dashboard route", async () => {
    render(<App />);

    expect((await screen.findAllByRole("heading", { name: "Dashboard" })).length).toBeGreaterThan(
      0,
    );
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

  it("warns before browser refresh when task runs are active", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (input === "/api/auth/status") {
        return Promise.resolve(jsonResponse(200, { status: "claimed-authenticated" }));
      }

      if (input === "/api/opencode") {
        return Promise.resolve(jsonResponse(200, { state: "healthy" }));
      }

      if (input === "/api/tasks/runs/active") {
        return Promise.resolve(
          jsonResponse(200, [
            {
              id: "run-1",
              taskId: "task-1",
              agentId: "agent-1",
              status: "running",
              triggerSource: "manual",
              startedAt: "2026-01-01T00:00:00.000Z",
              opencodeSessionId: "session-1",
              renderedPrompt: "Run task",
              renderedContext: {},
              effectivePermissions: {},
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ]),
        );
      }

      if (input === "/api/system/version") {
        return Promise.resolve(jsonResponse(200, systemVersionPayload()));
      }

      return Promise.reject(new Error("Unexpected fetch URL."));
    });

    render(<App />);

    await screen.findByRole("link", { name: "1 active task" });
    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    const prevented = !window.dispatchEvent(event);

    expect(prevented).toBe(true);
    expect(event.returnValue).toBe(false);
  });

  it("collapses the sidebar to icon-only navigation on desktop", async () => {
    render(<App />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Collapse sidebar" }));

    expect(screen.queryByText("Provider Connections")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agents" })).toHaveAttribute("href", "/agents");
    expect(window.localStorage.getItem("cc-sidebar-collapsed")).toBe("true");
  });

  it("opens the navigation drawer on mobile", async () => {
    setDesktopMatchMedia(false);
    render(<App />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open navigation" }));

    expect(screen.getByRole("link", { name: "Integrations" })).toBeInTheDocument();
  });

  it("opens global search from the keyboard shortcut and searches agents and files", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (typeof input !== "string") {
        return Promise.reject(new Error("Unexpected fetch input."));
      }

      if (input === "/api/auth/status") {
        return Promise.resolve(jsonResponse(200, { status: "claimed-authenticated" }));
      }

      if (input === "/api/opencode") {
        return Promise.resolve(jsonResponse(200, { state: "healthy" }));
      }

      if (input === "/api/tasks/runs/active") {
        return Promise.resolve(jsonResponse(200, []));
      }

      if (input === "/api/system/version") {
        return Promise.resolve(jsonResponse(200, systemVersionPayload()));
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

    await screen.findByRole("link", { name: "CommandsCenter" });
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

  it("shows up to three recent agents in the expanded agents section", async () => {
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

    expect(await screen.findByRole("link", { name: "🤖 Planner Plans" })).toHaveAttribute(
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

  it("shows and dismisses the first-run env notice", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (input === "/api/auth/status") {
        return Promise.resolve(jsonResponse(200, { status: "claimed-authenticated" }));
      }

      if (input === "/api/opencode") {
        return Promise.resolve(jsonResponse(200, { state: "healthy" }));
      }

      if (input === "/api/tasks/runs/active") {
        return Promise.resolve(jsonResponse(200, []));
      }

      if (input === "/api/system/version") {
        return Promise.resolve(
          jsonResponse(200, {
            ...systemVersionPayload(),
            firstRun: {
              envFileCreated: true,
              envFilePath: "/home/test/.cc/.env",
            },
          }),
        );
      }

      return Promise.reject(new Error("Unexpected fetch input."));
    });

    render(<App />);

    const user = userEvent.setup();
    expect(
      await screen.findByRole("dialog", { name: "Configuration key generated" }),
    ).toBeInTheDocument();
    expect(screen.getByText("/home/test/.cc/.env")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "I saved it" }));

    expect(
      screen.queryByRole("dialog", { name: "Configuration key generated" }),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem("cc-first-run-env-notice-dismissed")).toBe("true");
  });

  it("does not repeat the first-run env notice after dismissal", async () => {
    window.localStorage.setItem("cc-first-run-env-notice-dismissed", "true");
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (input === "/api/auth/status") {
        return Promise.resolve(jsonResponse(200, { status: "claimed-authenticated" }));
      }

      if (input === "/api/opencode") {
        return Promise.resolve(jsonResponse(200, { state: "healthy" }));
      }

      if (input === "/api/tasks/runs/active") {
        return Promise.resolve(jsonResponse(200, []));
      }

      if (input === "/api/system/version") {
        return Promise.resolve(
          jsonResponse(200, {
            ...systemVersionPayload(),
            firstRun: { envFileCreated: true, envFilePath: "/home/test/.cc/.env" },
          }),
        );
      }

      return Promise.reject(new Error("Unexpected fetch input."));
    });

    render(<App />);

    expect((await screen.findAllByRole("heading", { name: "Dashboard" })).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByRole("dialog", { name: "Configuration key generated" }),
    ).not.toBeInTheDocument();
  });

  it("updates active navigation and header title when navigating", async () => {
    mockFetch([jsonResponse(200, [connectedProvider])]);

    render(<App />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Provider Connections" }));

    await screen.findByRole("heading", { name: "OpenAI", level: 2 });
    expect(screen.getByRole("heading", { name: "Provider Connections" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/providers");
  });

  it("persists theme selection from the profile page", async () => {
    render(<App />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Profile" }));
    await user.click(screen.getByRole("button", { name: "modern" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("modern");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("modern");
  });

  it("redirects protected routes to claim when the workspace is unclaimed", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (input === "/api/auth/status") {
        return Promise.resolve(jsonResponse(200, { status: "unclaimed" }));
      }

      return Promise.reject(new Error(`Unexpected fetch URL: ${describeFetchInput(input)}`));
    });

    window.history.replaceState({}, "", "/agents");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Claim this workspace" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-navigation")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/claim");
  });

  it("signs in and returns to the requested protected route", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (input === "/api/auth/status") {
        return Promise.resolve(jsonResponse(200, { status: "claimed-unauthenticated" }));
      }

      if (input === "/api/auth/login") {
        return Promise.resolve(jsonResponse(200, { status: "claimed-authenticated" }));
      }

      if (input === "/api/opencode") {
        return Promise.resolve(jsonResponse(200, { state: "healthy" }));
      }

      if (input === "/api/tasks/runs/active") {
        return Promise.resolve(jsonResponse(200, []));
      }

      if (input === "/api/system/version") {
        return Promise.resolve(jsonResponse(200, systemVersionPayload()));
      }

      return Promise.reject(new Error(`Unexpected fetch URL: ${describeFetchInput(input)}`));
    });

    window.history.replaceState({}, "", "/agents");
    render(<App />);

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Password"), "owner-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Agents" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/agents");
  });

  it("claims the workspace and returns to the requested protected route", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (input === "/api/auth/status") {
        return Promise.resolve(jsonResponse(200, { status: "unclaimed" }));
      }

      if (input === "/api/auth/claim") {
        return Promise.resolve(jsonResponse(200, { status: "claimed-authenticated" }));
      }

      if (input === "/api/opencode") {
        return Promise.resolve(jsonResponse(200, { state: "healthy" }));
      }

      if (input === "/api/tasks/runs/active") {
        return Promise.resolve(jsonResponse(200, []));
      }

      if (input === "/api/system/version") {
        return Promise.resolve(jsonResponse(200, systemVersionPayload()));
      }

      return Promise.reject(new Error(`Unexpected fetch URL: ${describeFetchInput(input)}`));
    });

    window.history.replaceState({}, "", "/agents");
    render(<App />);

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Claim code"), "claim-code");
    await user.type(screen.getByLabelText("Password"), "owner-password");
    await user.type(screen.getByLabelText("Confirm password"), "owner-password");
    await user.click(screen.getByRole("button", { name: "Claim workspace" }));

    expect(await screen.findByRole("heading", { name: "Agents" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/agents");
  });

  it("shows password requirements on the claim page", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (input === "/api/auth/status") {
        return Promise.resolve(jsonResponse(200, { status: "unclaimed" }));
      }

      return Promise.reject(new Error(`Unexpected fetch URL: ${describeFetchInput(input)}`));
    });

    render(<App />);

    expect(
      await screen.findByText(
        "Use at least 10 characters, including uppercase, lowercase, a number, and a symbol.",
      ),
    ).toBeInTheDocument();
  });

  it("shows specific claim password validation issues", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (input === "/api/auth/status") {
        return Promise.resolve(jsonResponse(200, { status: "unclaimed" }));
      }

      if (input === "/api/auth/claim") {
        return Promise.resolve(
          jsonResponse(400, {
            error: {
              code: "password_validation_failed",
              message: "Owner password does not meet requirements.",
              details: {
                issues: ["Password must include at least one uppercase letter."],
              },
            },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch URL: ${describeFetchInput(input)}`));
    });

    render(<App />);

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Claim code"), "claim-code");
    await user.type(screen.getByLabelText("Password"), "owner-password");
    await user.type(screen.getByLabelText("Confirm password"), "owner-password");
    await user.click(screen.getByRole("button", { name: "Claim workspace" }));

    expect(
      await screen.findByText("Password must include at least one uppercase letter."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Owner password does not meet requirements."),
    ).not.toBeInTheDocument();
  });

  it("signs out from the profile page without showing protected content", async () => {
    render(<App />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Profile" }));
    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("heading", { name: "Sign in to CommandsCenter" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-navigation")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
  });

  it("validates password change confirmation on the profile page", async () => {
    render(<App />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Profile" }));
    await user.type(screen.getByLabelText("Current password"), "current-owner-password");
    await user.type(screen.getByLabelText("New password"), "new-owner-password");
    await user.type(screen.getByLabelText("Confirm new password"), "different-password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(screen.getByText("New password confirmation must match.")).toBeInTheDocument();
  });

  it("shows password change server errors on the profile page", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (input === "/api/auth/status") {
        return Promise.resolve(jsonResponse(200, { status: "claimed-authenticated" }));
      }

      if (input === "/api/auth/password") {
        return Promise.resolve(
          jsonResponse(401, { error: { code: "unauthorized", message: "Invalid credentials." } }),
        );
      }

      if (input === "/api/opencode") {
        return Promise.resolve(jsonResponse(200, { state: "healthy" }));
      }

      if (input === "/api/tasks/runs/active") {
        return Promise.resolve(jsonResponse(200, []));
      }

      if (input === "/api/system/version") {
        return Promise.resolve(jsonResponse(200, systemVersionPayload()));
      }

      return Promise.reject(new Error(`Unexpected fetch URL: ${describeFetchInput(input)}`));
    });

    render(<App />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Profile" }));
    await user.type(screen.getByLabelText("Current password"), "wrong-owner-password");
    await user.type(screen.getByLabelText("New password"), "new-owner-password");
    await user.type(screen.getByLabelText("Confirm new password"), "new-owner-password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Invalid credentials.")).toBeInTheDocument();
  });

  it("shows password change success on the profile page", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (input === "/api/auth/status") {
        return Promise.resolve(jsonResponse(200, { status: "claimed-authenticated" }));
      }

      if (input === "/api/auth/password") {
        return Promise.resolve(
          jsonResponse(200, { status: "changed", otherSessionsRevoked: true }),
        );
      }

      if (input === "/api/opencode") {
        return Promise.resolve(jsonResponse(200, { state: "healthy" }));
      }

      if (input === "/api/tasks/runs/active") {
        return Promise.resolve(jsonResponse(200, []));
      }

      if (input === "/api/system/version") {
        return Promise.resolve(jsonResponse(200, systemVersionPayload()));
      }

      return Promise.reject(new Error(`Unexpected fetch URL: ${describeFetchInput(input)}`));
    });

    render(<App />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Profile" }));
    await user.type(screen.getByLabelText("Current password"), "current-owner-password");
    await user.type(screen.getByLabelText("New password"), "new-owner-password");
    await user.type(screen.getByLabelText("Confirm new password"), "new-owner-password");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText("Password changed. Other browser sessions were signed out."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/password",
      expect.objectContaining({ method: "POST" }),
    );
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
    if (typeof input === "string" && input === "/api/auth/status") {
      return Promise.resolve(jsonResponse(200, { status: "claimed-authenticated" }));
    }

    if (typeof input === "string" && input === "/api/opencode") {
      return Promise.resolve(jsonResponse(200, { state: "healthy" }));
    }

    if (typeof input === "string" && input === "/api/tasks/runs/active") {
      return Promise.resolve(jsonResponse(200, []));
    }

    if (typeof input === "string" && input === "/api/system/version") {
      return Promise.resolve(jsonResponse(200, systemVersionPayload()));
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

function systemVersionPayload() {
  return {
    current: "1.0.0",
    updateAvailable: false,
    installMode: "npm-global",
    autoUpdateEnabled: false,
    autoUpdateSource: "environment",
  };
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

function describeFetchInput(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}
