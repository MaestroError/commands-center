import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Activity } from "@cc/shared/schemas";

vi.mock("./ActivityCard", () => ({
  ActivityCard: ({ activity }: { activity: Activity }) => <article>{activity.title}</article>,
}));

import { ActivityFeed } from "./ActivityFeed";

describe("ActivityFeed", () => {
  it("reports the nearest mobile card after scrolling", () => {
    const onMobileIndexChange = vi.fn();
    renderFeed([activity("First"), activity("Second"), activity("Third")], {
      onMobileIndexChange,
    });
    const feed = screen.getByTestId("activity-mobile-feed");
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 500 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, value: 980 });

    fireEvent.scroll(feed);

    expect(onMobileIndexChange).toHaveBeenCalledWith(2);
  });

  it("clamps the reported mobile position to the final card", () => {
    const onMobileIndexChange = vi.fn();
    renderFeed([activity("First"), activity("Second")], { onMobileIndexChange });
    const feed = screen.getByTestId("activity-mobile-feed");
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 500 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, value: 5000 });

    fireEvent.scroll(feed);

    expect(onMobileIndexChange).toHaveBeenCalledWith(1);
  });

  it("renders the selected filter empty state inside the mobile viewport", () => {
    renderFeed([], { emptyTitle: "No resolved notifications" });

    expect(screen.getByText("No resolved notifications")).toBeInTheDocument();
    expect(screen.getByText("Nothing is here yet.").closest("section")?.parentElement).toHaveClass(
      "h-full",
    );
  });
});

function renderFeed(
  activities: Activity[],
  overrides: Partial<Parameters<typeof ActivityFeed>[0]> = {},
): void {
  render(
    <ActivityFeed
      activities={activities}
      emptyDescription="Nothing is here yet."
      emptyTitle="No notifications"
      mobile
      mode="pending"
      onMarkRead={vi.fn()}
      onMarkUnread={vi.fn()}
      {...overrides}
    />,
  );
}

function activity(title: string): Activity {
  return {
    id: title.toLowerCase(),
    kind: "specialist_info",
    level: "info",
    status: "pending",
    title,
    body: null,
    payload: {},
    createdAt: "2026-08-27T12:00:00.000Z",
    updatedAt: "2026-08-27T12:00:00.000Z",
    archivedAt: null,
  };
}
