import { createTaskState, expect, mockTaskApi, test } from "./fixtures";

test.describe("task runs", { tag: "@tasks" }, () => {
  test("shows run history on the full-page task detail", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks/task-ready");

    await expect(page.getByTestId("task-detail-page")).toBeVisible();
    await page.getByTestId("task-detail-tab-runs").click();
    await expect(page.getByTestId("task-run-row-run-1")).toBeVisible();
  });

  test("navigates from a run row into the run inspector", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks/task-ready");
    await page.getByTestId("task-detail-tab-runs").click();
    await page.getByTestId("task-run-row-run-1").getByRole("link", { name: "Inspect" }).click();

    await expect(page).toHaveURL(/\/tasks\/task-ready\/runs\/run-1/);
    await expect(page.getByTestId("task-run-inspector")).toBeVisible();
  });

  test("toggles the session log and switches to the details tab", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks/task-ready/runs/run-1");

    const inspector = page.getByTestId("task-run-inspector");
    await expect(inspector).toBeVisible();

    const sessionLog = page.getByTestId("task-run-session-log");
    await expect(sessionLog).toHaveAttribute("aria-expanded", "false");
    await sessionLog.click();
    await expect(sessionLog).toHaveAttribute("aria-expanded", "true");

    await page.getByTestId("task-run-tab-details").click();
    await expect(page.getByTestId("task-run-tab-details")).toHaveAttribute("aria-selected", "true");
  });
});
