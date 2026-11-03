import { createTaskState, expect, mockTaskApi, test } from "./fixtures";

test.describe("task replies", { tag: "@tasks" }, () => {
  test("saves pre-run feedback in the single task timeline", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);
    await page.goto("/tasks?task=task-backlog");
    const panel = page.getByTestId("task-detail-panel");
    await expect(panel.getByTestId("task-timeline")).toBeVisible();
    await panel.getByTestId("task-reply-input").fill("Please retest the release flow.");
    await panel.getByTestId("task-reply-send").click();
    await expect(panel.getByTestId("task-timeline")).toContainText(
      "Please retest the release flow.",
    );
    await page.reload();
    await expect(page.getByTestId("task-timeline")).toContainText(
      "Waiting for the task’s first execution",
    );
  });

  test("cancels a pending reply without creating an assignment", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);
    await page.goto("/tasks?task=task-backlog");
    const timeline = page.getByTestId("task-timeline");
    await timeline.getByTestId("task-reply-input").fill("Prepare additional evidence");
    await timeline.getByTestId("task-reply-send").click();
    await timeline.getByRole("button", { name: "Cancel queued reply" }).click();
    await expect(timeline.getByRole("button", { name: "Cancel queued reply" })).toHaveCount(0);
    expect(state.repliesByTaskId["task-backlog"]?.[0]?.status).toBe("cancelled");
    expect(state.runsByTaskId["task-backlog"] ?? []).toHaveLength(0);
  });
});
