import { expect, test } from "@playwright/test";

test("renders the provider connections shell", async ({ page }) => {
  await page.goto("/providers");

  await expect(
    page.getByRole("heading", { name: "Connect models once, use them everywhere." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
});

test("keeps the screen usable on mobile", async ({ page }) => {
  await page.goto("/providers");

  await expect(
    page.getByRole("heading", { name: "Connect models once, use them everywhere." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Provider Connections" })).toBeVisible();
});
