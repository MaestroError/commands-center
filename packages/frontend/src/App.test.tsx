import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";

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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("redirects to provider connections and renders providers", async () => {
    mockFetch([jsonResponse(200, [connectedProvider])]);

    render(<App />);

    await screen.findByRole("heading", { name: "OpenAI" });
    expect(window.location.pathname).toBe("/providers");
    expect(screen.getAllByText("GPT-4.1").length).toBeGreaterThan(0);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows the empty state when no providers are available", async () => {
    mockFetch([jsonResponse(200, [])]);

    render(<App />);

    expect(await screen.findByText(/No providers are available/i)).toBeInTheDocument();
  });

  it("submits API keys from the provider dialog", async () => {
    const fetchMock = mockFetch([
      jsonResponse(200, [{ ...connectedProvider, connected: false }]),
      jsonResponse(200, { success: true }),
      jsonResponse(200, [connectedProvider]),
    ]);

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("OpenAI");
    await user.click(screen.getByRole("button", { name: /Connect API key/i }));
    await user.type(screen.getByLabelText("API key"), "sk-test");
    await user.click(screen.getByRole("button", { name: /Save key/i }));

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

    render(<App />);

    const user = userEvent.setup();
    await screen.findByText("OpenAI");
    await user.click(screen.getByRole("button", { name: /Connect OAuth/i }));
    await user.click(screen.getByRole("button", { name: /Open provider login/i }));
    await screen.findByText(/OAuth session started/i);
    await user.type(screen.getByLabelText(/Manual code or callback value/i), "oauth-code");
    await user.click(screen.getByRole("button", { name: /Complete OAuth/i }));

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

  it("shows API errors", async () => {
    mockFetch([jsonResponse(500, { error: { message: "Provider listing failed." } })]);

    render(<App />);

    expect(await screen.findByText("Provider listing failed.")).toBeInTheDocument();
  });
});

function mockFetch(responses: Response[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    const next = responses.shift();

    if (!next) {
      throw new Error("No mocked response left.");
    }

    return Promise.resolve(next);
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}
