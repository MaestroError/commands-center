import { activityKindSchema, type Activity } from "@cc/shared/schemas";

import { expect, test, type Page, type Route } from "./fixtures";
import { createTaskState, mockTaskApi } from "./tasks/fixtures";

const NOW = "2026-07-29T12:00:00.000Z";

test("marks every dashboard notification type as read", async ({ isMobile, page }) => {
  test.skip(isMobile, "The desktop notification panel is hidden at mobile breakpoints.");

  const activities = activityKindSchema.options.map((kind, index) => createActivity(kind, index));
  const archivedIds: string[] = [];
  await mockActivitiesApi(page, activities, archivedIds);

  await page.goto("/");

  for (const activity of activities) {
    const card = page.getByTestId(`activity-card-${activity.id}`);
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Mark read" })).toBeVisible();
  }

  for (const activity of activities) {
    const card = page.getByTestId(`activity-card-${activity.id}`);
    await card.getByRole("button", { name: "Mark read" }).click();
    await expect(card).toHaveCount(0);
  }

  expect(archivedIds).toEqual(activities.map((activity) => activity.id));
});

test("filters action-required activity and restores resolved activity", async ({
  isMobile,
  page,
}) => {
  test.skip(isMobile, "The desktop notification panel is hidden at mobile breakpoints.");

  const info = createActivity("specialist_info", 1, { level: "info", title: "Digest ready" });
  const attention = createActivity("specialist_warning", 2, {
    level: "action_required",
    title: "Review blocked",
  });
  const resolved = createActivity("feedback_resolved", 3, {
    level: "info",
    status: "archived",
    title: "Earlier update",
    archivedAt: NOW,
  });
  const activities = [info, attention, resolved];
  await mockActivitiesApi(page, activities, [], { [resolved.id]: [attention.id] });

  await page.goto("/");
  await page.getByTestId("activity-tab-attention").click();

  await expect(page.getByText("Review blocked")).toBeVisible();
  await expect(page.getByText("Digest ready")).toHaveCount(0);

  await page.getByTestId("activity-tab-resolved").click();
  await page.getByRole("button", { name: "Mark unread" }).click();
  await expect
    .poll(() => activities.map(({ id, status }) => ({ id, status })))
    .toEqual([
      { id: info.id, status: "pending" },
      { id: attention.id, status: "archived" },
      { id: resolved.id, status: "pending" },
    ]);

  await page.getByTestId("activity-tab-all").click();
  await expect(page.getByText("Earlier update")).toBeVisible();
  await expect(page.getByText("Review blocked")).toHaveCount(0);
  await page.getByTestId("activity-tab-resolved").click();
  await expect(page.getByText("Review blocked")).toBeVisible();
  await expect(page.getByText("Earlier update")).toHaveCount(0);
});

test("opens the mobile notification feed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const activities = [
    createActivity("specialist_warning", 1, {
      payload: { sourceSpecialistSlug: "testing-agent" },
    }),
  ];
  await mockActivitiesApi(page, activities, []);

  await page.goto("/");
  await page.getByRole("button", { name: /Notifications/ }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close notifications" })).toBeVisible();
  await expect(page.getByTestId("activity-mobile-tab-attention")).toBeVisible();

  const dialog = page.getByRole("dialog");
  const dialogBox = await dialog.boundingBox();
  const card = dialog.getByTestId("activity-card-activity-1");
  const cardBox = await card.boundingBox();
  const buttonBox = await card.getByRole("button", { name: "Mark read" }).boundingBox();
  const cardStyle = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderLeftWidth: Number.parseFloat(style.borderLeftWidth),
      borderRadius: Number.parseFloat(style.borderTopLeftRadius),
    };
  });

  expect(dialogBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect((cardBox?.x ?? 0) - (dialogBox?.x ?? 0)).toBeGreaterThanOrEqual(15);
  expect(cardStyle.borderRadius).toBeGreaterThanOrEqual(12);
  expect(cardStyle.borderLeftWidth).toBeGreaterThanOrEqual(3);
  expect(buttonBox?.width ?? 0).toBeGreaterThan((cardBox?.width ?? 0) * 0.85);
});

test("closes the mobile notification feed when resized to desktop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockActivitiesApi(page, [createActivity("specialist_info", 1)], []);
  await page.goto("/");
  await page.getByRole("button", { name: /Notifications/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 844 });

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("activity-panel")).toBeVisible();
  await page.getByTestId("activity-tab-attention").click();
});

test("keeps mobile notification actions in one proportional row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const activities = [
    createActivity("task_completed", 1, {
      payload: { taskId: "task-1", sourceSpecialistSlug: "testing-agent" },
    }),
  ];
  await mockActivitiesApi(page, activities, []);

  await page.goto("/");
  await page.getByRole("button", { name: /Notifications/ }).click();

  const card = page.getByRole("dialog").getByTestId("activity-card-activity-1");
  const primaryBox = await card.getByRole("button", { name: "Accept" }).boundingBox();
  const openTaskBox = await card.getByRole("button", { name: "Open task" }).boundingBox();
  const markReadBox = await card.getByRole("button", { name: "Mark read" }).boundingBox();

  expect(primaryBox).not.toBeNull();
  expect(openTaskBox).not.toBeNull();
  expect(markReadBox).not.toBeNull();
  expect(primaryBox?.y).toBe(openTaskBox?.y);
  expect(primaryBox?.y).toBe(markReadBox?.y);
  expect(primaryBox?.width ?? 0).toBeGreaterThan(openTaskBox?.width ?? 0);
  expect(primaryBox?.width ?? 0).toBeGreaterThan(markReadBox?.width ?? 0);
});

test("accepts a task from the mobile notification feed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createTaskState();
  const activities = [
    createActivity("task_completed", 1, {
      payload: { taskId: "task-ready", sourceSpecialistSlug: "planner" },
    }),
  ];
  const archivedIds: string[] = [];
  await mockActivitiesApi(page, activities, archivedIds);
  await mockTaskApi(page, state);

  await page.goto("/");
  await page.getByRole("button", { name: /Notifications/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept" }).click();

  await expect(page.getByRole("dialog").getByText("0 of 0")).toBeVisible();
  expect(state.tasks.find((task) => task.id === "task-ready")?.status).toBe("done");
  expect(archivedIds).toEqual(["activity-1"]);
});

test("opens a task from the mobile notification feed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createTaskState();
  const activities = [
    createActivity("task_completed", 1, {
      payload: { taskId: "task-ready", sourceSpecialistSlug: "planner" },
    }),
  ];
  await mockActivitiesApi(page, activities, []);
  await mockTaskApi(page, state);

  await page.goto("/");
  await page.getByRole("button", { name: /Notifications/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Open task" }).click();

  await expect(page).toHaveURL(/\/tasks\?task=task-ready$/);
  await expect(page.getByTestId("task-detail-panel")).toBeVisible();
});

test("keeps mobile card-internal controls at least 44px tall", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createTaskState();
  const task = state.tasks.find((entry) => entry.id === "task-ready");
  if (!task) throw new Error("Expected task fixture to include task-ready.");
  task.todos = [
    {
      id: "todo-1",
      content: "Review output",
      status: "pending",
      createdAt: NOW,
    },
  ];
  const activities = [
    createActivity("task_needs_review", 1, {
      payload: {
        taskId: "task-ready",
        taskRunId: "run-1",
        question: "Publish it?",
        suggestedReplies: ["Publish"],
        runOutput: "outcome: ready_for_review",
      },
    }),
  ];
  await mockActivitiesApi(page, activities, []);
  await mockTaskApi(page, state);

  await page.goto("/");
  await page.getByRole("button", { name: /Notifications/ }).click();
  const dialog = page.getByRole("dialog");
  const runOutput = dialog.getByRole("button", { name: /Run output/ });
  const criteria = dialog.getByRole("button", { name: /Acceptance criteria/ });
  const criteriaCheckbox = dialog.getByRole("checkbox", { name: 'Mark "Review output" as met' });
  const suggestedReply = dialog.getByRole("button", { name: "Use suggested reply: Publish" });

  await expect(runOutput).toHaveCSS("min-height", "44px");
  await expect(criteria).toHaveCSS("min-height", "44px");
  await expect(criteriaCheckbox).toHaveCSS("height", "44px");
  await expect(criteriaCheckbox).toHaveCSS("width", "44px");
  await expect(suggestedReply).toHaveCSS("min-height", "44px");
});

test("keeps a long mobile review workflow reachable in a short viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 });
  const state = createTaskState();
  const suggestedReplies = [
    "Approve after checking every listed condition",
    "Request revisions for the remaining edge cases",
    "Pause until the additional evidence is available",
    "Escalate the unresolved decision to the operator",
  ];
  const activities = [
    createActivity("task_needs_review", 1, {
      payload: {
        taskId: "task-ready",
        taskRunId: "run-1",
        question:
          "Review every condition in this detailed request before choosing a response. ".repeat(6),
        suggestedReplies,
      },
    }),
  ];
  await mockActivitiesApi(page, activities, []);
  await mockTaskApi(page, state);
  await page.route("**/api/tasks/task-ready/runs/run-1/followups", async (route: Route) => {
    if (route.request().method() === "POST") {
      await route.fulfill(jsonResponse({ error: { message: "Reply failed." } }, 500));
      return;
    }
    await route.fallback();
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Notifications/ }).click();
  const footer = page.getByTestId("activity-card-footer");

  await expect
    .poll(() =>
      footer.evaluate((element) => ({
        clientHeight: element.clientHeight,
        overflowY: getComputedStyle(element).overflowY,
        scrollHeight: element.scrollHeight,
      })),
    )
    .toMatchObject({ overflowY: "auto" });
  expect(await footer.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );

  for (const reply of suggestedReplies) {
    const action = footer.getByRole("button", { name: `Use suggested reply: ${reply}` });
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeVisible();
  }
  await footer
    .getByRole("button", { name: `Use suggested reply: ${suggestedReplies.at(-1)}` })
    .click();
  const replyBox = footer.getByRole("textbox", { name: "Review reply" });
  await expect(replyBox).toHaveValue(suggestedReplies.at(-1) ?? "");
  await replyBox.fill("Please revise this work.");
  await footer.getByRole("button", { name: "Reply" }).click();
  const error = footer.getByText("Could not send the reply.");
  await error.scrollIntoViewIfNeeded();

  await expect(error).toHaveText("Could not send the reply.");
  await footer.getByRole("button", { name: "Open task" }).scrollIntoViewIfNeeded();
  await expect(footer.getByRole("button", { name: "Open task" })).toBeVisible();
  await expect(footer.getByRole("button", { name: "Mark read" })).toBeVisible();
});

test("filters and repositions a multi-card mobile notification feed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const activities = [
    createActivity("specialist_info", 1, { level: "info", title: "Digest ready" }),
    createActivity("specialist_warning", 2, {
      level: "action_required",
      title: "Review blocked",
    }),
    createActivity("task_completed", 3, { level: "info", title: "Task complete" }),
    createActivity("feedback_resolved", 4, {
      level: "info",
      status: "archived",
      title: "Earlier update",
      archivedAt: NOW,
    }),
  ];
  await mockActivitiesApi(page, activities, []);

  await page.goto("/");
  await page.getByRole("button", { name: /Notifications/ }).click();
  let dialog = page.getByRole("dialog");

  await expect(dialog.getByTestId("activity-mobile-tab-all")).toContainText("3");
  await expect(dialog.getByTestId("activity-mobile-tab-attention")).toContainText("1");
  await expect(dialog.getByTestId("activity-mobile-tab-resolved")).toContainText("1");
  await expect(dialog.getByText("1 of 3")).toBeVisible();

  await dialog.getByTestId("activity-mobile-feed").evaluate((feed) => {
    feed.scrollTop = feed.clientHeight;
    feed.dispatchEvent(new Event("scroll"));
  });
  await expect(dialog.getByText("2 of 3")).toBeVisible();

  await dialog.getByTestId("activity-mobile-tab-attention").click();
  await expect(dialog.getByText("1 of 1")).toBeVisible();
  await expect(dialog.getByText("Review blocked")).toBeVisible();
  expect(await dialog.getByTestId("activity-mobile-feed").evaluate((feed) => feed.scrollTop)).toBe(
    0,
  );

  await dialog.getByTestId("activity-mobile-tab-all").click();
  await dialog.getByTestId("activity-mobile-feed").evaluate((feed) => {
    feed.scrollTop = feed.clientHeight;
    feed.dispatchEvent(new Event("scroll"));
  });
  await expect(dialog.getByText("2 of 3")).toBeVisible();
  await dialog.getByRole("button", { name: "Close notifications" }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: /Notifications/ }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText("1 of 3")).toBeVisible();
});

test("marks a mobile notification read", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const activities = [createActivity("specialist_info", 1, { level: "info" })];
  const archivedIds: string[] = [];
  await mockActivitiesApi(page, activities, archivedIds);

  await page.goto("/");
  await page.getByRole("button", { name: /Notifications/ }).click();
  const dialog = page.getByRole("dialog");

  await dialog.getByRole("button", { name: "Mark read" }).click();

  await expect(dialog.getByText("0 of 0")).toBeVisible();
  expect(archivedIds).toEqual(["activity-1"]);
});

test("swipes a mobile notification read", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const activities = [createActivity("specialist_info", 1, { level: "info" })];
  const archivedIds: string[] = [];
  await mockActivitiesApi(page, activities, archivedIds);

  await page.goto("/");
  await page.getByRole("button", { name: /Notifications/ }).click();
  const dialog = page.getByRole("dialog");
  const headerBox = await dialog.getByTestId("activity-card-header").boundingBox();
  expect(headerBox).not.toBeNull();

  await page.mouse.move((headerBox?.x ?? 0) + 250, (headerBox?.y ?? 0) + 40);
  await page.mouse.down();
  await page.mouse.move((headerBox?.x ?? 0) + 60, (headerBox?.y ?? 0) + 42, { steps: 5 });
  await page.mouse.up();

  await expect(dialog.getByText("0 of 0")).toBeVisible();
  expect(archivedIds).toEqual(["activity-1"]);
});

test("scrolls the mobile card body without marking it read", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const activities = [
    createActivity("specialist_info", 1, {
      level: "info",
      body: Array.from({ length: 30 }, (_, index) => `Paragraph ${index + 1}`).join("\n\n"),
    }),
  ];
  const archivedIds: string[] = [];
  await mockActivitiesApi(page, activities, archivedIds);

  await page.goto("/");
  await page.getByRole("button", { name: /Notifications/ }).click();
  const dialog = page.getByRole("dialog");
  const body = dialog.getByTestId("activity-card-body");
  await body.hover();
  await page.mouse.wheel(0, 500);

  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(dialog.getByTestId("activity-card-activity-1")).toBeVisible();
  expect(archivedIds).toEqual([]);
});

test("marks a resolved mobile notification unread", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const activities = [
    createActivity("specialist_warning", 2, {
      level: "action_required",
      title: "Displaced update",
    }),
    createActivity("feedback_resolved", 1, {
      level: "info",
      status: "archived",
      title: "Earlier update",
      archivedAt: NOW,
    }),
  ];
  await mockActivitiesApi(page, activities, [], { "activity-1": ["activity-2"] });

  await page.goto("/");
  await page.getByRole("button", { name: /Notifications/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("activity-mobile-tab-resolved").click();

  await dialog.getByRole("button", { name: "Mark unread" }).click();

  await expect
    .poll(() => activities.map(({ id, status }) => ({ id, status })))
    .toEqual([
      { id: "activity-2", status: "archived" },
      { id: "activity-1", status: "pending" },
    ]);
  await dialog.getByTestId("activity-mobile-tab-all").click();
  await expect(dialog.getByText("Earlier update")).toBeVisible();
  await expect(dialog.getByText("Displaced update")).toHaveCount(0);
  await dialog.getByTestId("activity-mobile-tab-resolved").click();
  await expect(dialog.getByText("Displaced update")).toBeVisible();
  await expect(dialog.getByText("Earlier update")).toHaveCount(0);
});

test("contains long notification content within the desktop panel", async ({ isMobile, page }) => {
  test.skip(isMobile, "The desktop notification panel is hidden at mobile breakpoints.");

  const activities = [
    createActivity("run_command_proposal", 1, {
      payload: { command: `printf ${"x".repeat(600)}` },
    }),
  ];
  await mockActivitiesApi(page, activities, []);

  await page.goto("/");

  const panelBox = await page.getByTestId("activity-panel").boundingBox();
  const cardBox = await page.getByTestId("activity-card-activity-1").boundingBox();
  expect(panelBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect((cardBox?.x ?? 0) + (cardBox?.width ?? 0)).toBeLessThanOrEqual(
    (panelBox?.x ?? 0) + (panelBox?.width ?? 0) + 1,
  );
});

function createActivity(
  kind: Activity["kind"],
  index: number,
  overrides: Partial<Activity> = {},
): Activity {
  return {
    id: `activity-${index}`,
    kind,
    level: ["task_completed", "feedback_resolved", "specialist_info"].includes(kind)
      ? "info"
      : "action_required",
    status: "pending",
    title: `${kind} notification`,
    body: null,
    payload: {},
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    ...overrides,
  };
}

async function mockActivitiesApi(
  page: Page,
  activities: Activity[],
  archivedIds: string[],
  unarchiveDisplacedIds: Record<string, string[]> = {},
): Promise<void> {
  await page.route("**/api/specialists", async (route: Route) => {
    await route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/activities**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/api/activities") {
      const status = url.searchParams.get("status") ?? "pending";
      const listed = activities.filter((activity) =>
        status === "archived" ? activity.status === "archived" : activity.status === "pending",
      );
      const actionRequiredCount = activities.filter(
        (activity) => activity.status === "pending" && activity.level === "action_required",
      ).length;
      await route.fulfill(jsonResponse({ activities: listed, actionRequiredCount }));
      return;
    }

    if (request.method() === "POST" && url.pathname === "/api/activities/archive-all") {
      const pending = activities.filter((activity) => activity.status === "pending");
      for (const activity of pending) {
        activity.status = "archived";
        activity.archivedAt = NOW;
        archivedIds.push(activity.id);
      }
      await route.fulfill(jsonResponse({ archivedCount: pending.length }));
      return;
    }

    const match = url.pathname.match(/^\/api\/activities\/([^/]+)\/(archive|unarchive)$/);
    if (request.method() === "POST" && match) {
      const id = decodeURIComponent(match[1] ?? "");
      const activity = activities.find((entry) => entry.id === id);
      if (!activity) {
        await route.fulfill(jsonResponse({ error: { message: "Activity not found." } }, 404));
        return;
      }
      const archive = match[2] === "archive";
      activity.status = archive ? "archived" : "pending";
      activity.archivedAt = archive ? NOW : null;
      activity.updatedAt = NOW;
      if (archive) {
        archivedIds.push(id);
      }
      if (!archive) {
        const displacedIds = unarchiveDisplacedIds[id] ?? [];
        for (const displacedId of displacedIds) {
          const displaced = activities.find((entry) => entry.id === displacedId);
          if (displaced) {
            displaced.status = "archived";
            displaced.archivedAt = NOW;
            displaced.updatedAt = NOW;
          }
        }
        await route.fulfill(jsonResponse({ activity, archivedActivityIds: displacedIds }));
        return;
      }
      await route.fulfill(jsonResponse(activity));
      return;
    }

    await route.fallback();
  });
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}
