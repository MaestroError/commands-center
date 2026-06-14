import { expect, test, type Page, type Route } from "./fixtures";

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

test("renders the global shell and provider page", async ({ page, isMobile }) => {
  const state: ProviderState = { connected: true };
  await mockProviderApi(page, state);

  await page.goto("/providers");

  await expect(page.getByRole("heading", { name: "Provider Connections" })).toBeVisible();
  await expect(page.getByText("Frontend foundation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Menu" })).toHaveCount(0);
  if (isMobile) {
    await expect(page.getByTestId("sidebar-navigation")).toBeHidden();
  } else {
    await expect(page.getByRole("link", { name: "CommandsCenter" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "Agents" }).first()).toHaveAttribute(
      "href",
      "/agents",
    );
    await expect(page.getByTestId("sidebar-navigation")).toBeVisible();
    await expect(page.getByText("Theme:")).toBeVisible();
  }
  await expect(page.getByText("1 connected model")).toBeVisible();
});

test("submits API keys from the provider screen", async ({ page }) => {
  const state: ProviderState = { connected: false };
  await mockProviderApi(page, state);

  await page.goto("/providers");
  await page.getByRole("button", { name: "Connect API key" }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Connect API key" }).click({ force: true });
  await page.getByLabel("API key").fill("sk-test");
  await page.getByLabel("API key").press("Enter");

  await expect(page.getByText("Provider connected successfully")).toBeVisible();
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
  await page.getByRole("button", { name: "Connect OAuth" }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Connect OAuth" }).click({ force: true });
  await page.getByRole("button", { name: "Open provider login" }).click({ force: true });
  await expect(page.getByText("OAuth session started")).toBeVisible();
  await page.getByLabel("Manual code or callback value").fill("oauth-code");
  await page.getByRole("button", { name: "Complete OAuth" }).click({ force: true });

  await expect(page.getByText("Provider connected successfully")).toBeVisible();
});

test("supports theme changes through the profile page", async ({ page }) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: "modern" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "modern");
});

test("keeps the shell usable on mobile", async ({ page, isMobile }) => {
  const state: ProviderState = { connected: false };
  await mockProviderApi(page, state, { includeChatRoutes: true });

  await page.goto("/chat/demo-agent");

  if (!isMobile) {
    await expect(page.getByTestId("context-pane")).toBeVisible();
    return;
  }

  await page.getByRole("button", { name: "Open context pane" }).click();
  await expect(page.getByRole("tab", { name: "Files" })).toBeVisible();
  await expect(page.getByText("No files in workspace")).toBeVisible();
});

async function mockProviderApi(
  page: Page,
  state: ProviderState,
  options?: { includeChatRoutes?: boolean },
): Promise<void> {
  await page.route("**/api/opencode", async (route: Route) => {
    await route.fulfill(jsonResponse({ state: "healthy" }));
  });

  await page.route("**/api/tasks/runs/active", async (route: Route) => {
    await route.fulfill(jsonResponse([]));
  });

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

  if (!options?.includeChatRoutes) {
    return;
  }

  const agent = {
    id: "agent-1",
    slug: "demo-agent",
    name: "Demo Specialist",
    role: "demo role",
    instructions: "demo instructions",
    defaultModel: "openai/gpt-4.1",
    workspacePath: "/tmp/agents/demo-agent",
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
  };
  const conversation = {
    id: "conversation-1",
    agentId: agent.id,
    opencodeSessionId: "session-1",
    title: "Demo conversation",
    status: "active",
    source: "chat",
    isCurrent: true,
    messageCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    messages: [],
  };

  await page.route("**/api/agents/catalog", async (route: Route) => {
    await route.fulfill(
      jsonResponse({
        builtInSkills: [],
        workspaceSkills: [],
        providerModels: [{ id: "openai/gpt-4.1", label: "openai/gpt-4.1" }],
        mcpServers: [],
        appMcpServers: [],
        customTools: [],
      }),
    );
  });

  await page.route("**/api/agents/by-slug/demo-agent", async (route: Route) => {
    await route.fulfill(jsonResponse(agent));
  });

  await page.route("**/api/agents/agent-1/conversations/active", async (route: Route) => {
    await route.fulfill(jsonResponse({ current: conversation, previous: [] }));
  });

  await page.route("**/api/agents/agent-1/conversations/conversation-1", async (route: Route) => {
    await route.fulfill(jsonResponse(conversation));
  });

  await page.route("**/api/agents/agent-1/conversations", async (route: Route) => {
    await route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/conversations/conversation-1/media", async (route: Route) => {
    await route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/agents/agent-1/workspace/file**", async (route: Route) => {
    await route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/agents/agent-1/workspace/events", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "",
      headers: { "cache-control": "no-cache" },
    });
  });

  await page.route("**/api/conversations/conversation-1/events", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "",
      headers: { "cache-control": "no-cache" },
    });
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
