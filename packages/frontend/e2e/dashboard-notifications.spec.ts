import { activityKindSchema, type Activity } from "@cc/shared/schemas";

import { expect, test, type Page, type Route } from "./fixtures";

const NOW = "2026-07-29T12:00:00.000Z";

test("marks every dashboard notification type as read", async ({ page }) => {
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

function createActivity(kind: Activity["kind"], index: number): Activity {
  return {
    id: `activity-${index}`,
    kind,
    level: "action_required",
    status: "pending",
    title: `${kind} notification`,
    body: null,
    payload: {},
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
  };
}

async function mockActivitiesApi(
  page: Page,
  activities: Activity[],
  archivedIds: string[],
): Promise<void> {
  await page.route("**/api/specialists", async (route: Route) => {
    await route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/activities/*/archive", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const match = url.pathname.match(/^\/api\/activities\/([^/]+)\/archive$/);

    if (request.method() !== "POST" || !match) {
      await route.fallback();
      return;
    }

    const id = decodeURIComponent(match[1] ?? "");
    const activity = activities.find((entry) => entry.id === id);

    if (!activity) {
      await route.fulfill(jsonResponse({ error: { message: "Activity not found." } }, 404));
      return;
    }

    activity.status = "archived";
    activity.archivedAt = NOW;
    activity.updatedAt = NOW;
    archivedIds.push(id);
    await route.fulfill(jsonResponse(activity));
  });

  await page.route("**/api/activities*", async (route: Route) => {
    const pending = activities.filter((activity) => activity.status === "pending");
    await route.fulfill(
      jsonResponse({
        activities: pending,
        actionRequiredCount: pending.length,
      }),
    );
  });
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}
