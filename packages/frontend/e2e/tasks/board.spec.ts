import { createTaskState, dragCard, expect, mockTaskApi, test } from "./fixtures";

test.describe("tasks board", { tag: "@tasks" }, () => {
  for (const colorMode of ["light", "dark"] as const) {
    test(`${colorMode} accent controls share their foreground`, async ({ page }) => {
      const state = createTaskState();
      await mockTaskApi(page, state);
      await page.addInitScript((mode) => {
        window.localStorage.setItem("cc.color-mode", mode);
      }, colorMode);

      await page.goto("/tasks");

      const boardColor = await page
        .getByTestId("task-view-tab-board")
        .evaluate((element) => getComputedStyle(element).color);
      const createColor = await page
        .getByRole("link", { name: "Create task" })
        .evaluate((element) => getComputedStyle(element).color);

      expect(boardColor).toBe(createColor);
    });
  }

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
    await expect(page.getByTestId("task-column-failed")).toHaveCount(0);
    await expect(page.getByTestId("task-column-review")).toHaveCount(0);
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

  test("moves a backlog card to scheduled via drag-and-drop date dialog", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks");
    await expect(page.getByTestId("task-card-task-backlog")).toBeVisible();
    await expect(page.getByTestId("task-column-scheduled")).toBeVisible();
    await dragCard(page, "task-card-task-backlog", "task-column-scheduled");

    const dialog = page.getByRole("form", { name: "Schedule task" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Schedule for").fill("2026-01-02T09:30");

    const patch = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/task-backlog") &&
        response.request().method() === "PATCH",
    );
    await dialog.getByRole("button", { name: "Schedule task" }).click();
    await patch;

    await expect(
      page.getByTestId("task-column-scheduled").getByTestId("task-card-task-backlog"),
    ).toBeVisible();
  });

  test("restores and deletes archived tasks from archive view", async ({ page }) => {
    const state = createTaskState();
    const archived = state.archivedTasks[0];
    if (archived) {
      state.archivedTasks.push({
        ...archived,
        id: "task-archived-delete",
        title: "Delete archived",
      });
    }
    await mockTaskApi(page, state);

    await page.goto("/tasks");
    await page.getByTestId("task-view-tab-archive").click();

    const restore = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/task-archived/restore") &&
        response.request().method() === "POST",
    );
    await page
      .getByTestId("task-card-task-archived")
      .getByRole("button", { name: "Restore" })
      .click();
    await restore;

    await page.getByTestId("task-view-tab-board").click();
    await expect(
      page.getByTestId("task-column-backlog").getByTestId("task-card-task-archived"),
    ).toBeVisible();

    await page.getByTestId("task-view-tab-archive").click();
    const remove = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/task-archived-delete") &&
        response.request().method() === "DELETE",
    );
    await page
      .getByTestId("task-card-task-archived-delete")
      .getByRole("button", { name: "Delete" })
      .click();
    await remove;

    await expect(page.getByTestId("task-card-task-archived-delete")).toHaveCount(0);
  });

  test("accepts a review card and moves it to done", async ({ page }) => {
    const state = createTaskState();
    state.tasks.push({
      ...state.tasks[0]!,
      id: "task-review",
      title: "Answer review question",
      status: "review",
      latestRunId: "run-review",
    });
    await mockTaskApi(page, state);

    await page.goto("/tasks");

    const accept = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/task-review/accept") &&
        response.request().method() === "POST",
    );
    await page.getByTestId("task-card-task-review").getByTestId("task-card-action-accept").click();
    await accept;

    await expect(
      page.getByTestId("task-column-done").getByTestId("task-card-task-review"),
    ).toBeVisible();
  });

  test("renders subtask progress on board cards", async ({ page }) => {
    const state = createTaskState();
    state.subtaskProgress = [
      {
        taskId: "task-backlog",
        total: 2,
        completed: 1,
        active: 0,
        review: 1,
        failed: 0,
        subtasks: [
          { id: "subtask-1", description: "Review release notes", status: "review" },
          { id: "subtask-2", description: "Update changelog", status: "done" },
        ],
      },
    ];
    await mockTaskApi(page, state);

    await page.goto("/tasks");

    await expect(page.getByLabel("Subtasks")).toBeVisible();
    await expect(page.getByLabel("Subtask: Review release notes")).toBeVisible();
  });

  test("opens archived task detail as read-only and restores it", async ({ page }) => {
    const state = createTaskState();
    state.runsByTaskId["task-archived"] = [
      { ...state.runsByTaskId["task-ready"]![0]!, taskId: "task-archived" },
    ];
    await mockTaskApi(page, state);

    await page.goto("/tasks?view=archive");
    await page.getByRole("link", { name: "Archived release" }).click();

    await expect(page).toHaveURL(/\/tasks\/task-archived\?view=archive$/);
    await expect(page.getByTestId("task-detail-page")).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Run now" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit task title" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Leave comment" })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByText("Release notes drafted.").first()).toBeVisible();

    await page.getByTestId("task-detail-tab-runs").click();
    await page.getByTestId(/task-run-inspect-/).click();
    await expect(page).toHaveURL(/\/tasks\/task-archived\/runs\/[^/]+\?view=archive$/);
    await page.getByRole("link", { name: "Back to task" }).click();
    await expect(page).toHaveURL(/\/tasks\/task-archived\?view=archive$/);

    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page).toHaveURL(/\/tasks\/task-archived$/);
    await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();
  });

  test("deletes an archived task from its confirmed detail action", async ({ page }) => {
    const state = createTaskState();
    await mockTaskApi(page, state);

    await page.goto("/tasks/task-archived?view=archive");
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete task" }).click();

    await expect(page).toHaveURL(/\/tasks\?view=archive$/);
    await expect(page.getByText("No archived tasks yet")).toBeVisible();
  });

  test("cancels a running card from the queued column", async ({ page }) => {
    const state = createTaskState();
    const runningTask = {
      ...state.tasks[0]!,
      id: "task-running",
      title: "Running task",
      status: "queued" as const,
      latestRunId: "run-running",
    };
    const runningRun = {
      ...state.runsByTaskId["task-ready"]![0]!,
      id: "run-running",
      taskId: "task-running",
      status: "running" as const,
    };
    state.tasks.push(runningTask);
    state.runsByTaskId["task-running"] = [runningRun];
    state.activeRuns = [runningRun];
    await mockTaskApi(page, state);

    await page.goto("/tasks");

    const cancel = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/tasks/task-running/runs/run-running/cancel") &&
        response.request().method() === "POST",
    );
    await page
      .getByTestId("task-card-task-running")
      .getByTestId("task-card-action-cancel-run")
      .click();
    await cancel;

    await expect(
      page.getByTestId("task-column-failed").getByTestId("task-card-task-running"),
    ).toBeVisible();
  });

  test("keeps empty columns visible when one column overflows", async ({ page }) => {
    const state = createTaskState();
    const backlogTask = state.tasks[0]!;
    state.tasks = Array.from({ length: 12 }, (_, index) => ({
      ...backlogTask,
      id: `task-overflow-${String(index + 1)}`,
      title: `Overflow task ${String(index + 1)}`,
      status: "backlog" as const,
    }));
    await mockTaskApi(page, state);

    await page.goto("/tasks");

    await expect(page.getByTestId("task-column-count-backlog")).toHaveText("12");
    await expect(page.getByTestId("task-column-scheduled")).toContainText(
      "Scheduled tasks will queue automatically when their time arrives.",
    );
  });
});
