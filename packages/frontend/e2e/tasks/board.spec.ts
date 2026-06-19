import { createTaskState, dragCard, expect, mockTaskApi, test } from "./fixtures";

test.describe("tasks board", { tag: "@tasks" }, () => {
  test("renders columns with task counts", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks");

    await expect(page.getByTestId("tasks-board")).toBeVisible();
    await expect(page.getByTestId("task-card-task-backlog")).toBeVisible();
    await expect(page.getByTestId("task-card-task-ready")).toBeVisible();
    await expect(page.getByTestId("task-card-task-done")).toBeVisible();
    await expect(page.getByTestId("task-column-count-backlog")).toHaveText("1");
    await expect(page.getByTestId("task-column-count-done")).toHaveText("1");
  });

  test("filters board cards by free text", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks");
    await page.getByTestId("task-filter-toggle").click();
    await page.getByTestId("task-filter-input").fill("changelog");

    await expect(page.getByTestId("task-card-task-ready")).toBeVisible();
    await expect(page.getByTestId("task-card-task-backlog")).toHaveCount(0);
  });

  test("opens the detail panel and edits the title", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks");
    await page.getByTestId("task-card-title-task-backlog").click();

    const panel = page.getByTestId("task-detail-panel");
    await expect(panel).toBeVisible();

    await panel.getByTestId("task-title-edit").click();
    await panel.getByTestId("task-title-input").fill("Ship release v2");

    const patch = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/task-backlog") &&
        response.request().method() === "PATCH",
    );
    await panel.getByTestId("task-title-save").click();
    await patch;

    await expect(panel.getByTestId("task-title-edit")).toContainText("Ship release v2");
  });

  test("edits the task prompt from the detail panel", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks?task=task-backlog");

    const panel = page.getByTestId("task-detail-panel");
    await panel.getByTestId("task-prompt-edit").click();
    await panel.getByTestId("task-prompt-input").fill("Draft v2 release notes.");

    const patch = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/task-backlog") &&
        response.request().method() === "PATCH",
    );
    await panel.getByTestId("task-prompt-save").click();
    await patch;

    await expect(panel.getByTestId("task-prompt-display")).toContainText("Draft v2 release notes.");
  });

  test("queues a backlog task from the card action", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks");

    const queue = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/task-backlog/queue") &&
        response.request().method() === "POST",
    );
    await page.getByTestId("task-card-task-backlog").getByTestId("task-card-action-queue").click();
    await queue;

    await expect(
      page.getByTestId("task-column-queued").getByTestId("task-card-task-backlog"),
    ).toBeVisible();
  });

  test("accepts a ready-to-check task from the card action", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks");

    const accept = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/task-ready/accept") &&
        response.request().method() === "POST",
    );
    await page.getByTestId("task-card-task-ready").getByTestId("task-card-action-accept").click();
    await accept;

    await expect(
      page.getByTestId("task-column-done").getByTestId("task-card-task-ready"),
    ).toBeVisible();
  });

  test("moves a backlog card to queued via drag-and-drop", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks");
    await expect(page.getByTestId("task-card-task-backlog")).toBeVisible();

    const queue = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/task-backlog/queue") &&
        response.request().method() === "POST",
    );
    await dragCard(page, "task-card-task-backlog", "task-column-queued");
    await queue;

    await expect(
      page.getByTestId("task-column-queued").getByTestId("task-card-task-backlog"),
    ).toBeVisible();
  });
});
