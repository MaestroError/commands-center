import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    return Promise.resolve(unarchived);
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

describe("ActivityPanel", () => {
  it("shows all pending activities and excludes resolved activity from All", async () => {
    renderPanel();

    expect(await screen.findByText("Digest completed")).toBeInTheDocument();
    expect(screen.getByText("Review blocked")).toBeInTheDocument();
    expect(screen.queryByText("Earlier update")).not.toBeInTheDocument();
  });

  it("filters Needs attention using action_required", async () => {
    renderPanel();
    await screen.findByText("Digest completed");

    fireEvent.click(screen.getByTestId("activity-tab-attention"));

    expect(screen.getByText("Review blocked")).toBeInTheDocument();
    expect(screen.queryByText("Digest completed")).not.toBeInTheDocument();
  });

  it("marks a resolved activity unread", async () => {
    renderPanel();
    await screen.findByText("Digest completed");
    fireEvent.click(screen.getByTestId("activity-tab-resolved"));
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

  it("opens the mobile full-screen notification feed from its teaser", async () => {
    renderPanel();
    await screen.findByText("Digest completed");

    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close notifications" })).toBeInTheDocument();
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
