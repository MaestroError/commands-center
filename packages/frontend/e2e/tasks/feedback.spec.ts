import { createTaskState, expect, mockTaskApi, test } from "./fixtures";

test.describe("task feedback", { tag: "@tasks" }, () => {
  test("submits feedback and renders it as a comment", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks?task=task-backlog");

    const panel = page.getByTestId("task-detail-panel");
    await expect(panel.getByTestId("task-feedback-section")).toBeVisible();

    await panel.getByTestId("task-feedback-open").click();
    await panel.getByTestId("task-feedback-input").fill("Please retest the release flow.");

    const create = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/task-backlog/feedback") &&
        response.request().method() === "POST",
    );
    await panel.getByTestId("task-feedback-submit").click();
    await create;

    const comment = panel.getByTestId("task-feedback-comment-feedback-1");
    await expect(comment).toBeVisible();
    await expect(comment).toContainText("Please retest the release flow.");
  });

  test("submits feedback with an agent mention", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks?task=task-backlog");

    const panel = page.getByTestId("task-detail-panel");
    await panel.getByTestId("task-feedback-open").click();
    await panel.getByTestId("task-feedback-input").fill("Please retest @");

    // The "@" opens the agent mention popover; selecting an agent adds a chip.
    await panel.getByRole("button", { name: "@Reviewer" }).click();
    await expect(panel.getByText("@Reviewer")).toBeVisible();

    const create = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/task-backlog/feedback") &&
        response.request().method() === "POST",
    );
    await panel.getByTestId("task-feedback-submit").click();
    const request = (await create).request();

    const payload = JSON.parse(request.postData() ?? "{}") as { mentionedAgentIds?: string[] };
    expect(payload.mentionedAgentIds).toContain("agent-2");
    await expect(panel.getByTestId("task-feedback-comment-feedback-1")).toBeVisible();
  });
});
