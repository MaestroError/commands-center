import { expect, test, type Page, type Route } from "./fixtures";

type McpServerRecord = {
  id: string;
  name: string;
  enabled: boolean;
  config: {
    url: string;
    transport: "streamable-http";
    authMethod: "headers";
    headers: Array<{ key: string; value: string }>;
  };
  missingSecrets: string[];
  requiresEngineRestart: boolean;
  runtimeStatus: { status: string };
  tools: never[];
  createdAt: string;
  updatedAt: string;
};

test("connects another CC instance and activates it with restart consent", async ({ page }) => {
  const servers: McpServerRecord[] = [];
  const savedSecrets: Array<{ key: string; restart: boolean }> = [];
  await mockIntegrationsApi(page, servers, savedSecrets);

  await page.goto("/integrations");

  await expect(page.getByRole("heading", { name: "Connected CC instances" })).toBeVisible();
  await page.getByRole("button", { name: "Add CC instance" }).click();

  // A friendly label is saved under the technical name OpenCode derives, so the
  // rendered permission pattern matches the tool ids it generates.
  await page.getByLabel("CC instance name").fill("Staging CC");
  await expect(page.getByText("staging_cc")).toBeVisible();
  await page.getByLabel("CC instance URL").fill("cc.example.com");
  await expect(page.getByText("https://cc.example.com/api/public/mcp")).toBeVisible();
  await expect(page.getByLabel("CC instance secret name")).toHaveValue(
    "CC_INSTANCE_STAGING_CC_TOKEN",
  );

  await page.getByLabel("CC instance API token").fill("cc-token");
  await page.getByRole("button", { name: "Save instance" }).click();

  await expect(
    page.getByText("staging_cc saved. Activate it when you are ready to restart the AI engine."),
  ).toBeVisible();
  await expect(page.getByText("Disabled", { exact: true })).toBeVisible();
  expect(savedSecrets).toEqual([{ key: "CC_INSTANCE_STAGING_CC_TOKEN", restart: false }]);

  await page.getByRole("button", { name: "Activate" }).click();
  await expect(
    page.getByRole("heading", { name: "Restart the AI engine to activate staging_cc?" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Restart and activate" }).click();

  await expect(page.getByText("staging_cc activated.")).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
});

async function mockIntegrationsApi(
  page: Page,
  servers: McpServerRecord[],
  savedSecrets: Array<{ key: string; restart: boolean }>,
): Promise<void> {
  await page.route("**/api/specialists", async (route: Route) => {
    await route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/secrets", async (route: Route) => {
    await route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/secrets/*", async (route: Route) => {
    const body = route.request().postDataJSON() as { value: string; restart: boolean };
    const key = decodeURIComponent(route.request().url().split("/").pop() ?? "");
    savedSecrets.push({ key, restart: body.restart });
    await route.fulfill({ status: 204, body: "" });
  });

  await page.route("**/api/mcp-servers", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill(jsonResponse(servers));
      return;
    }

    const body = route.request().postDataJSON() as Pick<McpServerRecord, "name" | "config"> & {
      enabled: boolean;
    };
    const created: McpServerRecord = {
      id: "mcp-instance",
      name: body.name,
      enabled: body.enabled,
      config: body.config,
      missingSecrets: [],
      requiresEngineRestart: true,
      runtimeStatus: { status: "disabled" },
      tools: [],
      createdAt: "2026-04-22T10:00:00.000Z",
      updatedAt: "2026-04-22T10:00:00.000Z",
    };
    servers.push(created);
    await route.fulfill(jsonResponse(created));
  });

  await page.route("**/api/mcp-servers/*/activate", async (route: Route) => {
    const server = servers[0];
    if (!server) {
      await route.fulfill({ status: 404, body: "" });
      return;
    }

    server.enabled = true;
    server.requiresEngineRestart = false;
    server.runtimeStatus = { status: "connected" };
    await route.fulfill(jsonResponse(server));
  });
}

function jsonResponse(body: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}
