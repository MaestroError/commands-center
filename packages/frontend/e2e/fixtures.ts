import { test as base, expect, type Page, type Route } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, run) => {
    await page.route("**/api/auth/status", async (route: Route) => {
      await route.fulfill(jsonResponse({ status: "claimed-authenticated" }));
    });

    await page.route("**/api/auth/logout", async (route: Route) => {
      await route.fulfill(jsonResponse({ status: "claimed-unauthenticated" }));
    });

    await page.route("**/api/system/version", async (route: Route) => {
      await route.fulfill(
        jsonResponse({
          current: "1.0.0",
          updateAvailable: false,
          installMode: "npm-global",
          autoUpdateEnabled: false,
          autoUpdateSource: "environment",
        }),
      );
    });

    await page.route("**/api/opencode", async (route: Route) => {
      await route.fulfill(jsonResponse({ state: "healthy" }));
    });

    await page.route("**/api/tasks/runs/active", async (route: Route) => {
      await route.fulfill(jsonResponse([]));
    });

    await run(page);
  },
});

export { expect, type Page, type Route };

function jsonResponse(body: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}
