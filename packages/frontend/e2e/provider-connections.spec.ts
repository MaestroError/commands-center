import { expect, test, type Page, type Route } from "@playwright/test";

type ProviderState = {
  connected: boolean;
};

const provider = {
  provider: {
    id: "openai",
    name: "OpenAI",
    source: "api",
    env: ["OPENAI_API_KEY"],
    models: {
      "openai/gpt-4.1": { name: "GPT-4.1" },
    },
  },
  defaultModel: "openai/gpt-4.1",
  authMethods: [
    { type: "api", label: "API key" },
    { type: "oauth", label: "Browser OAuth" },
  ],
  models: [{ id: "openai/gpt-4.1", name: "GPT-4.1", providerId: "openai" }],
} as const;

test("submits API keys from the provider screen", async ({ page }) => {
  const state: ProviderState = { connected: false };
  await mockProviderApi(page, state);

  await page.goto("/providers");
  await page.getByRole("button", { name: "Connect API key" }).click();
  await page.getByLabel("API key").fill("sk-test");
  await page.getByRole("button", { name: "Save key" }).click();

  await expect(
    page.getByRole("heading", { name: "Provider connected successfully" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByText("1 connected model")).toBeVisible();
});

test("starts and completes OAuth from the provider screen", async ({ page }) => {
  const state: ProviderState = { connected: false };
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await mockProviderApi(page, state);

  await page.goto("/providers");
  await page.getByRole("button", { name: "Connect OAuth" }).click();
  await page.getByRole("button", { name: "Open provider login" }).click();
  await expect(page.getByText("OAuth session started")).toBeVisible();
  await page.getByLabel("Manual code or callback value").fill("oauth-code");
  await page.getByRole("button", { name: "Complete OAuth" }).click();

  await expect(
    page.getByRole("heading", { name: "Provider connected successfully" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
});

test("disconnects a connected provider", async ({ page }) => {
  const state: ProviderState = { connected: true };
  await mockProviderApi(page, state);

  await page.goto("/providers");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Disconnect" }).click();

  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
  await expect(page.getByText("0 connected models")).toBeVisible();
});

test("keeps the screen usable on mobile", async ({ page }) => {
  const state: ProviderState = { connected: false };
  await mockProviderApi(page, state);

  await page.goto("/providers");

  await expect(
    page.getByRole("heading", { name: "Connect models once, use them everywhere." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Provider Connections" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect API key" })).toBeVisible();
});

async function mockProviderApi(page: Page, state: ProviderState): Promise<void> {
  await page.route("**/api/providers", async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await route.fulfill(jsonResponse([providerPayload(state)]));
  });

  await page.route("**/api/providers/openai/api-key", async (route: Route) => {
    state.connected = true;
    await route.fulfill(jsonResponse({ success: true }));
  });

  await page.route("**/api/providers/openai/oauth/start", async (route: Route) => {
    await route.fulfill(
      jsonResponse({
        url: "https://provider.example/oauth",
        method: "code",
        instructions: "Complete login in the browser, then paste the code here.",
      }),
    );
  });

  await page.route("**/api/providers/openai/oauth/complete", async (route: Route) => {
    state.connected = true;
    await route.fulfill(
      jsonResponse({
        connected: true,
        pending: false,
        message: "Connected openai",
      }),
    );
  });

  await page.route("**/api/providers/openai", async (route: Route) => {
    state.connected = false;
    await route.fulfill(jsonResponse({ success: true }));
  });
}

function providerPayload(state: ProviderState) {
  return {
    ...provider,
    connected: state.connected,
  };
}

function jsonResponse(body: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}
