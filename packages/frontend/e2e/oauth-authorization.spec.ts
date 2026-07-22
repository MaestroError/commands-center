import { expect, test } from "@playwright/test";

test("@OAuth authorizes a public MCP client with an API token", async ({ page }) => {
  let submittedBody: unknown;

  await page.route("**/api/auth/status", async (route) => {
    await route.fulfill(jsonResponse({ status: "claimed-unauthenticated" }));
  });
  await page.route("**/api/oauth/interactions/interaction_e2e", async (route) => {
    if (route.request().method() === "POST") {
      submittedBody = route.request().postDataJSON();
      await route.fulfill(
        jsonResponse({ redirectTo: "http://127.0.0.1:4173/oauth/authorize/resume" }),
      );
      return;
    }

    await route.fulfill(
      jsonResponse({
        uid: "interaction_e2e",
        client: { id: "client-e2e", name: "Claude MCP" },
        redirectUri: "http://127.0.0.1:6274/callback",
        requestedResource: "http://127.0.0.1:4173/api/public/mcp",
        scopes: ["mcp"],
      }),
    );
  });
  await page.route("**/oauth/authorize/resume", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<main><h1>Authorization resumed</h1></main>",
    });
  });

  await page.goto("/oauth-interaction/interaction_e2e");

  await expect(page.getByRole("heading", { name: "Connect Claude MCP" })).toBeVisible();
  await expect(page.getByText("127.0.0.1:6274")).toBeVisible();
  const apiToken = page.getByLabel("API token");
  await expect(apiToken).toHaveAttribute("type", "password");
  await apiToken.fill("cc_e2e-secret-token");
  await page.getByRole("button", { name: "Authorize" }).click();

  await expect
    .poll(() => submittedBody)
    .toEqual({
      decision: "approve",
      apiToken: "cc_e2e-secret-token",
    });
  await expect(page).toHaveURL("http://127.0.0.1:4173/oauth/authorize/resume");
  await expect(page.getByRole("heading", { name: "Authorization resumed" })).toBeVisible();
});

function jsonResponse(body: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}
