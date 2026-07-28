import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OAuthInteractionDetail } from "@cc/shared/schemas";

import { decideOAuthInteraction, getOAuthInteraction } from "@/lib/api/oauth";

import { OAuthAuthorizationPage } from "./OAuthAuthorizationPage";

vi.mock("@/lib/api/oauth", () => ({
  decideOAuthInteraction: vi.fn(),
  getOAuthInteraction: vi.fn(),
}));

const interaction = {
  uid: "interaction_123",
  client: { id: "client-1", name: "Claude" },
  redirectUri: "http://127.0.0.1:49152/callback",
  requestedResource: "http://localhost:3000/api/public/mcp",
  scopes: ["mcp"],
} satisfies OAuthInteractionDetail;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getOAuthInteraction).mockResolvedValue(interaction);
});

describe("OAuthAuthorizationPage", () => {
  it("shows a loading state while reading the interaction", () => {
    vi.mocked(getOAuthInteraction).mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByRole("heading", { name: "Loading authorization request" })).toBeVisible();
  });

  it("warns where the client will receive the authorization response", async () => {
    renderPage();

    expect(
      await screen.findByText(/you will return to http:\/\/127\.0\.0\.1:49152/i),
    ).toBeVisible();
    expect(screen.getByText(/only continue if you recognize this client/i)).toBeVisible();
  });

  it("submits the API token for approval", async () => {
    const user = userEvent.setup();
    vi.mocked(decideOAuthInteraction).mockResolvedValue({
      redirectTo: "http://localhost:3000/oauth/authorize/interaction_123",
    });

    renderPage({ redirect: vi.fn() });
    await user.type(await screen.findByLabelText("API token"), "cc_secret-token");
    await user.click(screen.getByRole("button", { name: "Authorize" }));

    expect(decideOAuthInteraction).toHaveBeenCalledWith("interaction_123", {
      decision: "approve",
      apiToken: "cc_secret-token",
    });
  });

  it("cancels without submitting an API token", async () => {
    const user = userEvent.setup();
    vi.mocked(decideOAuthInteraction).mockResolvedValue({
      redirectTo: "http://localhost:3000/oauth/authorize/interaction_123",
    });

    renderPage({ redirect: vi.fn() });
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(decideOAuthInteraction).toHaveBeenCalledWith("interaction_123", {
      decision: "deny",
    });
  });

  it("shows an invalid-token response without retaining the submitted value", async () => {
    const user = userEvent.setup();
    vi.mocked(decideOAuthInteraction).mockRejectedValue(new Error("Invalid API token."));

    renderPage();
    const input = await screen.findByLabelText("API token");
    await user.type(input, "cc_invalid-secret");
    await user.click(screen.getByRole("button", { name: "Authorize" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid API token.");
    expect(input).toHaveValue("");
    expect(screen.queryByText("cc_invalid-secret")).not.toBeInTheDocument();
  });

  it("shows an unavailable state for an expired interaction", async () => {
    vi.mocked(getOAuthInteraction).mockRejectedValue(
      new Error("OAuth interaction is invalid or expired."),
    );

    renderPage();

    expect(await screen.findByRole("heading", { name: "Authorization unavailable" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("OAuth interaction is invalid or expired.");
    expect(screen.queryByLabelText("API token")).not.toBeInTheDocument();
  });

  it("redirects only to the URL returned by the decision API", async () => {
    const user = userEvent.setup();
    const redirect = vi.fn();
    const providerRedirect = "http://localhost:3000/oauth/authorize/interaction_123";
    vi.mocked(decideOAuthInteraction).mockResolvedValue({ redirectTo: providerRedirect });

    renderPage({ redirect });
    await user.type(await screen.findByLabelText("API token"), "cc_secret-token");
    await user.click(screen.getByRole("button", { name: "Authorize" }));

    await waitFor(() => expect(redirect).toHaveBeenCalledWith(providerRedirect));
    expect(redirect).not.toHaveBeenCalledWith(interaction.redirectUri);
  });

  it("clears the API token before following a successful redirect", async () => {
    const user = userEvent.setup();
    vi.mocked(decideOAuthInteraction).mockResolvedValue({
      redirectTo: "http://localhost:3000/oauth/authorize/interaction_123",
    });

    renderPage({ redirect: vi.fn() });
    const input = await screen.findByLabelText("API token");
    await user.type(input, "cc_secret-token");
    await user.click(screen.getByRole("button", { name: "Authorize" }));

    await waitFor(() => expect(input).toHaveValue(""));
  });
});

function renderPage(options: { redirect?: (url: string) => void } = {}): void {
  render(
    <MemoryRouter initialEntries={[`/oauth-interaction/${interaction.uid}`]}>
      <Routes>
        <Route
          element={<OAuthAuthorizationPage redirect={options.redirect} />}
          path="/oauth-interaction/:uid"
        />
      </Routes>
    </MemoryRouter>,
  );
}
