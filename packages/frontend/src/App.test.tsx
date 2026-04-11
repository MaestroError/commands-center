import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { queryClient } from "@/lib/query-client";
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
  queryClient.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
});

describe("App", () => {
  it("renders the global shell on the dashboard route", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CommandsCenter" })).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("link", { name: "Agents" })[0]).toHaveAttribute("href", "/agents");
    expect(screen.getByTestId("sidebar-navigation")).toBeInTheDocument();
    expect(screen.queryByText("Frontend foundation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Menu" })).not.toBeInTheDocument();
    expect(screen.getByText("Provider Connections")).toBeInTheDocument();
    expect(screen.getByTestId("recent-agents-empty-state")).toBeInTheDocument();
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
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}
