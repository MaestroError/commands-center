import { createTaskState, expect, mockTaskApi, test } from "./fixtures";

test.describe("task templates", { tag: "@tasks" }, () => {
  test("lists templates in the templates view", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks?view=templates");

    await expect(page.getByTestId("task-template-card-template-1")).toBeVisible();
    await expect(page.getByTestId("task-template-card-template-manual")).toBeVisible();
    await expect(page.getByTestId("task-template-title-template-1")).toHaveText(
      "Weekly release notes",
    );
  });

  test("creates a task from a template and opens the generated task", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks?view=templates");

    const create = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/templates/template-1/tasks") &&
        response.request().method() === "POST",
    );
    await page
      .getByTestId("task-template-card-template-1")
      .getByTestId("task-template-create-task")
      .click();
    await create;

    await expect(page).toHaveURL(/task=task-from-template-1/);
    await expect(page.getByTestId("task-detail-panel")).toBeVisible();
  });

  test("runs a template immediately and opens the generated task", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks?view=templates");

    await page
      .getByTestId("task-template-card-template-1")
      .getByTestId("task-card-action-run-now")
      .click();

    const runNow = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/templates/template-1/run-now") &&
        response.request().method() === "POST",
    );
    await page.getByTestId("task-run-context-submit").click();
    await runNow;

    await expect(page).toHaveURL(/task=task-backlog/);
    await expect(page.getByTestId("task-detail-panel")).toBeVisible();
  });

  test("edits a template from the edit form", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks?view=templates");
    await page
      .getByTestId("task-template-card-template-1")
      .getByTestId("task-card-action-edit-template")
      .click();

    await expect(page).toHaveURL(/\/tasks\/templates\/template-1\/edit/);
    await page.getByTestId("task-template-title-input").fill("Biweekly release notes");

    const patch = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/templates/template-1") &&
        response.request().method() === "PATCH",
    );
    await page.getByTestId("task-template-save").click();
    await patch;

    await expect(page).toHaveURL(/view=templates&template=template-1/);
  });

  test("deletes a template from the templates view", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks?view=templates");

    // The UI deletes a template by issuing DELETE against the task endpoint with the
    // template id (templates and tasks share an id space on delete).
    const remove = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/template-manual") &&
        response.request().method() === "DELETE",
    );
    const dialogPromise = page.waitForEvent("dialog").then(async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toBe("Delete template 'Reusable release checklist'?");
      await dialog.accept();
    });
    await page
      .getByTestId("task-template-card-template-manual")
      .getByTestId("task-card-action-delete-template")
      .click();
    await dialogPromise;
    await remove;

    await expect(page.getByTestId("task-template-card-template-manual")).toHaveCount(0);
  });
});
