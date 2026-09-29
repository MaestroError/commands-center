import { mockAuthFlowApis, mockSidebarSmokeApis } from "./app-fixtures";
import { expect, test } from "./fixtures";

test.describe("sidebar route smoke coverage", { tag: "@smoke" }, () => {
  test("renders the dashboard activity surface", async ({ isMobile, page }) => {
    await mockSidebarSmokeApis(page);

    await page.goto("/");

    await expect(
      page.getByRole("main").getByRole("heading", { exact: true, name: "Latest activity" }),
    ).toBeVisible();
    if (isMobile) {
      await page.getByRole("button", { name: /Notifications/ }).click();
      await expect(page.getByRole("dialog").getByText("Workspace ready")).toBeVisible();
    } else {
      await expect(page.getByText("Workspace ready")).toBeVisible();
    }
  });

  test("renders the documents editor surface", async ({ page }) => {
    await mockSidebarSmokeApis(page);

    await page.goto("/documents?path=Guides%2FOverview.md");

    await expect(page.getByTestId("document-editor-panel")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  });

  test("renders the file manager list surface", async ({ page }) => {
    await mockSidebarSmokeApis(page);

    await page.goto("/files");

    await expect(page.getByTestId("file-manager-list-dropzone")).toBeVisible();
    await expect(page.getByTestId("file-row-README.md")).toBeVisible();
  });

  test("renders integrations suggestions", async ({ page }) => {
    await mockSidebarSmokeApis(page);

    await page.goto("/integrations");

    await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Notion" })).toBeVisible();
  });

  test("renders the API tokens surface", async ({ page }) => {
    await mockSidebarSmokeApis(page);

    await page.goto("/developer-api");

    await expect(
      page.getByRole("main").getByRole("heading", { exact: true, name: "API" }),
    ).toBeVisible();
    await expect(page.getByText("No API tokens yet")).toBeVisible();
  });

  test("renders settings task monitor defaults", async ({ page }) => {
    await mockSidebarSmokeApis(page);

    await page.goto("/settings?tab=tasks");

    await expect(page.getByRole("heading", { name: "Task execution" })).toBeVisible();
    await expect(page.getByLabel("Requeue task after stall timeout")).not.toBeChecked();
  });
});

test.describe("owner auth flow", { tag: "@smoke" }, () => {
  test("claims an unclaimed workspace", async ({ page }) => {
    await mockAuthFlowApis(page, "unclaimed");

    await page.goto("/");
    await expect(page).toHaveURL(/\/claim$/);

    await page.getByLabel("Claim code").fill("claim-123");
    await page.locator('input[type="password"]').first().fill("Password123!");
    await page.locator('input[type="password"]').nth(1).fill("Password123!");
    await page.getByRole("button", { name: "Claim workspace" }).click();

    await expect(page).toHaveURL(/\/$/);
  });

  test("signs into a claimed workspace", async ({ page }) => {
    await mockAuthFlowApis(page, "claimed-unauthenticated");

    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    await page.locator('input[type="password"]').fill("Password123!");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/$/);
  });
});
