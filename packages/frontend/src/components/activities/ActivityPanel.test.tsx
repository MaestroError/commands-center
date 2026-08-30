import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Activity } from "@cc/shared/schemas";

import * as api from "@/lib/api";

import { ActivityPanel } from "./ActivityPanel";

vi.mock("@/lib/api", () => ({
  archiveActivity: vi.fn(),
  archiveAllActivities: vi.fn(),
  fillSecret: vi.fn(),
  getActivities: vi.fn(),
  unarchiveActivity: vi.fn(),
}));

vi.mock("@/hooks/use-specialists-query", () => ({
  useSpecialistsQuery: () => ({ data: [] }),
}));

const pendingInfo = activity({
  id: "info-1",
  kind: "specialist_info",
  level: "info",
  status: "pending",
  title: "Digest completed",
});
const pendingAttention = activity({
  id: "warning-1",
  kind: "specialist_warning",
  level: "action_required",
  status: "pending",
  title: "Review blocked",
});
const resolvedActivity = activity({
  id: "resolved-1",
  kind: "specialist_info",
  level: "info",
  status: "archived",
  title: "Earlier update",
});

let pending: Activity[];
let resolved: Activity[];

beforeEach(() => {
  pending = [pendingInfo, pendingAttention].map((entry) => ({ ...entry }));
  resolved = [{ ...resolvedActivity }];
  vi.mocked(api.getActivities).mockReset();
  vi.mocked(api.getActivities).mockImplementation((status) =>
    Promise.resolve({
      activities: status === "archived" ? resolved : pending,
      actionRequiredCount: pending.filter((entry) => entry.level === "action_required").length,
    }),
  );
  vi.mocked(api.archiveActivity).mockReset();
  vi.mocked(api.archiveActivity).mockImplementation((id) => {
    const match = pending.find((entry) => entry.id === id);
    if (!match) throw new Error("missing");
    pending = pending.filter((entry) => entry.id !== id);
    const archived = { ...match, status: "archived" as const, archivedAt: match.updatedAt };
    resolved = [...resolved, archived];
    return Promise.resolve(archived);
  });
  vi.mocked(api.unarchiveActivity).mockReset();
  vi.mocked(api.unarchiveActivity).mockImplementation((id) => {
    const match = resolved.find((entry) => entry.id === id);
    if (!match) throw new Error("missing");
    resolved = resolved.filter((entry) => entry.id !== id);
    const unarchived = { ...match, status: "pending" as const, archivedAt: null };
    pending = [...pending, unarchived];
    return Promise.resolve({ activity: unarchived, archivedActivityIds: [] });
  });
  vi.mocked(api.archiveAllActivities).mockReset();
  vi.mocked(api.archiveAllActivities).mockImplementation(() => {
    const archivedCount = pending.length;
    resolved = [
      ...resolved,
      ...pending.map((entry) => ({ ...entry, status: "archived" as const })),
    ];
    pending = [];
    return Promise.resolve({ archivedCount });
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ActivityPanel", () => {
  it("shows all pending activities and excludes resolved activity from All", async () => {
    renderPanel();

    expect(await screen.findByText("Digest completed")).toBeInTheDocument();
    expect(screen.getByText("Review blocked")).toBeInTheDocument();
    expect(screen.queryByText("Earlier update")).not.toBeInTheDocument();
  });

  it("filters Needs attention using action_required", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Digest completed");

    await user.click(screen.getByTestId("activity-tab-attention"));

    expect(screen.getByText("Review blocked")).toBeInTheDocument();
    expect(screen.queryByText("Digest completed")).not.toBeInTheDocument();
  });

  it("marks a resolved activity unread", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Digest completed");
    await user.click(screen.getByTestId("activity-tab-resolved"));
    await screen.findByText("Earlier update");

    fireEvent.click(screen.getByRole("button", { name: "Mark unread" }));

    await waitFor(() => expect(api.unarchiveActivity).toHaveBeenCalledWith("resolved-1"));
    await waitFor(() => expect(screen.queryByText("Earlier update")).not.toBeInTheDocument());
  });

  it("marks one activity read after its exit transition", async () => {
    renderPanel();
    await screen.findByText("Digest completed");

    const card = screen.getByTestId("activity-card-info-1");
    fireEvent.click(within(card).getByRole("button", { name: "Mark read" }));

    expect(card).toHaveStyle({ transform: "translateX(-110%)" });
    await waitFor(() => expect(api.archiveActivity).toHaveBeenCalledWith("info-1"));
    await waitFor(() => expect(screen.queryByText("Digest completed")).not.toBeInTheDocument());
  });

  it("moves focus to the next card after marking a focused activity read", async () => {
    renderPanel();
    await screen.findByText("Digest completed");
    const markRead = within(screen.getByTestId("activity-card-info-1")).getByRole("button", {
      name: "Mark read",
    });
    markRead.focus();

    fireEvent.click(markRead);

    await waitFor(() => expect(screen.getByTestId("activity-card-warning-1")).toHaveFocus());
  });

  it("moves focus to the active filter after marking the only resolved activity unread", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Digest completed");
    const resolvedFilter = screen.getByTestId("activity-tab-resolved");
    await user.click(resolvedFilter);
    const markUnread = await screen.findByRole("button", { name: "Mark unread" });
    markUnread.focus();

    fireEvent.click(markUnread);

    await waitFor(() => expect(resolvedFilter).toHaveFocus());
  });

  it("continues marking an activity read when its filter changes during exit", async () => {
    renderPanel();
    await screen.findByText("Digest completed");
    vi.useFakeTimers();

    fireEvent.click(
      within(screen.getByTestId("activity-card-info-1")).getByRole("button", {
        name: "Mark read",
      }),
    );
    fireEvent.click(screen.getByTestId("activity-tab-attention"));
    expect(screen.queryByText("Digest completed")).not.toBeInTheDocument();

    await act(async () => vi.advanceTimersByTimeAsync(180));

    expect(api.archiveActivity).toHaveBeenCalledWith("info-1");
  });

  it("requires confirmation before marking all activity read", async () => {
    renderPanel();
    await screen.findByText("Digest completed");

    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));

    expect(api.archiveAllActivities).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Mark all as read",
      }),
    );
    await waitFor(() => expect(api.archiveAllActivities).toHaveBeenCalledOnce());
  });

  it("cancels marking all activity read without submitting", async () => {
    renderPanel();
    await screen.findByText("Digest completed");
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));

    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }),
    );

    expect(api.archiveAllActivities).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows archive-all failure inside its confirmation", async () => {
    vi.mocked(api.archiveAllActivities).mockRejectedValueOnce(new Error("offline"));
    renderPanel();
    await screen.findByText("Digest completed");
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));

    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Mark all as read",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not mark all notifications as read",
    );
  });

  it("keeps archive-all pending and failure state visible after optimistic clearing", async () => {
    const request = deferred<{ archivedCount: number }>();
    vi.mocked(api.archiveAllActivities).mockReturnValueOnce(request.promise);
    renderPanel();
    await screen.findByText("Digest completed");
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Mark all as read",
      }),
    );

    await waitFor(() => expect(screen.queryByText("Digest completed")).not.toBeInTheDocument());
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marking…" })).toBeDisabled();

    request.reject(new Error("offline"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not mark all notifications as read",
    );
  });

  it("restores focus to the All filter after successfully marking all as read", async () => {
    const request = deferred<{ archivedCount: number }>();
    vi.mocked(api.archiveAllActivities).mockReturnValueOnce(request.promise);
    renderPanel();
    await screen.findByText("Digest completed");
    const trigger = screen.getByRole("button", { name: "Mark all as read" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Mark all as read",
      }),
    );

    request.resolve({ archivedCount: 2 });

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("activity-tab-all")).toHaveFocus());
  });

  it("opens the mobile full-screen notification feed from its teaser", async () => {
    renderPanel();
    await screen.findByText("Digest completed");

    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close notifications" })).toBeInTheDocument();
  });

  it("shows the confirmed counts in the mobile filters", async () => {
    renderPanel();
    await screen.findByText("Digest completed");
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByTestId("activity-mobile-tab-all")).toHaveTextContent("All2");
    expect(within(dialog).getByTestId("activity-mobile-tab-attention")).toHaveTextContent(
      "Needs attention1",
    );
    expect(within(dialog).getByTestId("activity-mobile-tab-resolved")).toHaveTextContent(
      "Resolved1",
    );
  });

  it("uses pressed buttons without dangling tabpanel references", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Digest completed");
    const all = screen.getByTestId("activity-tab-all");
    const attention = screen.getByTestId("activity-tab-attention");

    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(all).not.toHaveAttribute("aria-controls");
    expect(attention).toHaveAttribute("aria-pressed", "false");

    await user.click(attention);

    expect(all).toHaveAttribute("aria-pressed", "false");
    expect(attention).toHaveAttribute("aria-pressed", "true");
  });

  it("closes the mobile dialog when the desktop breakpoint begins matching", async () => {
    let breakpointListener: ((event: MediaQueryListEvent) => void) | undefined;
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_type, listener) => {
        if (query === "(min-width: 768px)" && typeof listener === "function") {
          breakpointListener = listener;
        }
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    renderPanel();
    await screen.findByText("Digest completed");
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    act(() => breakpointListener?.({ matches: true } as MediaQueryListEvent));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("blocks mark unread while the same activity is being archived", async () => {
    const request = deferred<Activity>();
    vi.mocked(api.archiveActivity).mockReturnValueOnce(request.promise);
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Digest completed");
    fireEvent.click(
      within(screen.getByTestId("activity-card-info-1")).getByRole("button", { name: "Mark read" }),
    );
    await waitFor(() => expect(api.archiveActivity).toHaveBeenCalledWith("info-1"));
    await user.click(screen.getByTestId("activity-tab-resolved"));

    const movedCard = screen.getByTestId("activity-card-info-1");
    expect(within(movedCard).getByRole("button", { name: "Marking…" })).toBeDisabled();
    fireEvent.click(within(movedCard).getByRole("button", { name: "Marking…" }));
    expect(api.unarchiveActivity).not.toHaveBeenCalled();
    request.resolve({ ...pendingInfo, status: "archived", archivedAt: pendingInfo.updatedAt });
  });

  it("keeps mobile header controls at least 44px tall", async () => {
    renderPanel();
    await screen.findByText("Digest completed");
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByRole("button", { name: "Close notifications" })).toHaveClass(
      "cc-button-icon",
    );
    expect(within(dialog).getByRole("button", { name: "Mark all as read" })).toHaveClass(
      "min-h-11",
    );
    expect(within(dialog).getByTestId("activity-mobile-tab-all")).toHaveClass("min-h-11");
  });

  it("resets the mobile feed position when its filter changes", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Digest completed");
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    const dialog = await screen.findByRole("dialog");
    const feed = within(dialog).getByTestId("activity-mobile-feed");
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 500 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, value: 500 });
    fireEvent.scroll(feed);
    expect(within(dialog).getByText("2 of 2")).toBeInTheDocument();

    await user.click(within(dialog).getByTestId("activity-mobile-tab-attention"));

    expect(within(dialog).getByText("1 of 1")).toBeInTheDocument();
    expect(within(dialog).getByTestId("activity-mobile-feed")).not.toBe(feed);
    expect(within(dialog).getByTestId("activity-mobile-feed")).toHaveProperty("scrollTop", 0);
  });

  it("reopens the mobile feed at its first card", async () => {
    renderPanel();
    await screen.findByText("Digest completed");
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    let dialog = await screen.findByRole("dialog");
    const feed = within(dialog).getByTestId("activity-mobile-feed");
    Object.defineProperty(feed, "clientHeight", { configurable: true, value: 500 });
    Object.defineProperty(feed, "scrollTop", { configurable: true, value: 500 });
    fireEvent.scroll(feed);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close notifications" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("1 of 2")).toBeInTheDocument();
  });

  it("shows mark-read failure inside the mobile feed", async () => {
    vi.mocked(api.archiveActivity).mockRejectedValueOnce(new Error("offline"));
    renderPanel();
    await screen.findByText("Digest completed");
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getAllByRole("button", { name: "Mark read" })[0]!);

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not update the notification",
    );
  });

  it("shows an earlier serialized archive failure while a later archive is pending", async () => {
    const first = deferred<Activity>();
    const second = deferred<Activity>();
    vi.mocked(api.archiveActivity)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderPanel();
    await screen.findByText("Digest completed");

    fireEvent.click(
      within(screen.getByTestId("activity-card-info-1")).getByRole("button", { name: "Mark read" }),
    );
    fireEvent.click(
      within(screen.getByTestId("activity-card-warning-1")).getByRole("button", {
        name: "Mark read",
      }),
    );
    await waitFor(() => expect(api.archiveActivity).toHaveBeenCalledTimes(1));

    first.reject(new Error("offline"));

    await waitFor(() => expect(api.archiveActivity).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not update the notification");
    second.resolve({
      ...pendingAttention,
      status: "archived",
      archivedAt: pendingAttention.updatedAt,
    });
  });

  it("shows mark-unread failure inside the mobile feed", async () => {
    const user = userEvent.setup();
    vi.mocked(api.unarchiveActivity).mockRejectedValueOnce(new Error("offline"));
    renderPanel();
    await screen.findByText("Digest completed");
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByTestId("activity-mobile-tab-resolved"));
    await within(dialog).findByText("Earlier update");

    fireEvent.click(within(dialog).getByRole("button", { name: "Mark unread" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not update the notification",
    );
  });
});

function renderPanel(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ActivityPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function activity(overrides: {
  id: string;
  kind: Activity["kind"];
  level: Activity["level"];
  status: Activity["status"];
  title: string;
}): Activity {
  return {
    body: null,
    payload: {},
    createdAt: "2026-08-27T12:00:00.000Z",
    updatedAt: "2026-08-27T12:00:00.000Z",
    archivedAt: overrides.status === "archived" ? "2026-08-27T12:00:00.000Z" : null,
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve = (_value: T): void => undefined;
  let reject = (_reason: unknown): void => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
