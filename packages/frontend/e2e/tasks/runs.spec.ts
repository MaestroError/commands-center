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
    await page.getByTestId("task-run-inspect-run-1").click();

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

test("opens a converted run in chat from run history", { tag: "@tasks" }, async ({ page }) => {
  const state = createTaskState();
  const run = state.runsByTaskId["task-ready"]![0]!;
  run.conversation = {
    id: "conv-1",
    source: "task_run",
    isCurrent: true,
    convertedAt: "2026-01-08T00:00:00.000Z",
  };
  await mockTaskApi(page, state);
  await page.route("**/api/tasks/task-ready/runs/run-1/open-in-chat", (route) =>
    route.fulfill({
      json: {
        current: {
          ...state.session.conversation,
          id: "conv-1",
          isCurrent: true,
          convertedAt: run.conversation?.convertedAt,
        },
        previous: [],
      },
    }),
  );
  await page.goto("/tasks/task-ready");
  await page.getByTestId("task-detail-tab-runs").click();
  await expect(page.getByTestId("task-run-reply-run-1")).toHaveCount(0);
  await page.getByTestId("task-run-open-chat-run-1").click();
  await expect(page).toHaveURL(/\/chat\/planner\/conv-1$/);
});

test("keeps converted archived runs read-only", { tag: "@tasks" }, async ({ page }) => {
  const state = createTaskState();
  state.runsByTaskId["task-archived"] = [
    {
      ...state.runsByTaskId["task-ready"]![0]!,
      taskId: "task-archived",
      conversation: {
        id: "conv-1",
        source: "task_run",
        isCurrent: true,
        convertedAt: "2026-01-08T00:00:00.000Z",
      },
    },
  ];
  state.session.canOpenInChat = true;
  await mockTaskApi(page, state);
  await page.goto("/tasks/task-archived?view=archive");
  await page.getByTestId("task-detail-tab-runs").click();
  await expect(page.getByTestId("task-run-open-chat-run-1")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open chat", exact: true })).toHaveCount(0);
  await page.getByTestId("task-run-inspect-run-1").click();
  await expect(page.getByTestId("task-run-inspector")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open chat", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Back to task" }).click();
  await expect(page).toHaveURL(/\/tasks\/task-archived\?view=archive$/);
});
