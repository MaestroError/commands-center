import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Activity, ActivityListResponse } from "@cc/shared/schemas";

import { useUnarchiveActivityMutation } from "@/hooks/use-activities-query";
import { queryKeys } from "@/lib/query-keys";

import { ActivityBell } from "./ActivityBell";

import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getActivities: vi.fn(),
  archiveActivity: vi.fn(),
  archiveAllActivities: vi.fn(),
  unarchiveActivity: vi.fn(),
}));

function makeWrapper(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function activity(overrides: Partial<Activity> & { id: string; title: string }): Activity {
  return {
    kind: "secret_request",
    level: "action_required",
    status: "pending",
    body: null,
    payload: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(api.getActivities).mockReset();
  vi.mocked(api.archiveActivity).mockReset();
  vi.mocked(api.archiveAllActivities).mockReset();
  vi.mocked(api.unarchiveActivity).mockReset();
});

describe("ActivityBell", () => {
  it("shows the action-required badge and lists items in the popover", async () => {
    vi.mocked(api.getActivities).mockResolvedValue({
      activities: [activity({ id: "a1", title: "Secret needed: GITHUB_TOKEN" })],
      actionRequiredCount: 1,
    });

    render(<ActivityBell />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByLabelText("Activity (1 need attention)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Activity (1 need attention)"));
    expect(screen.getByLabelText("Activity")).toHaveClass("fixed", "inset-x-3", "sm:absolute");
    expect(screen.getByText("Secret needed: GITHUB_TOKEN")).toBeInTheDocument();
  });

  it("hides the badge when nothing needs attention", async () => {
    vi.mocked(api.getActivities).mockResolvedValue({ activities: [], actionRequiredCount: 0 });

    render(<ActivityBell />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByLabelText("Activity")).toBeInTheDocument();
    });
  });

  it("marks all pending activities as read after confirmation", async () => {
    vi.mocked(api.getActivities).mockResolvedValue({
      activities: [activity({ id: "a1", title: "Secret needed: GITHUB_TOKEN" })],
      actionRequiredCount: 1,
    });
    vi.mocked(api.archiveAllActivities).mockResolvedValue({ archivedCount: 1 });

    render(<ActivityBell />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByLabelText("Activity (1 need attention)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("Activity (1 need attention)"));
    fireEvent.click(screen.getByText("Mark all as read"));
    const dialog = screen.getByRole("alertdialog");
    const confirmButton = within(dialog).getByRole("button", { name: "Mark all as read" });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(confirmButton);

    await waitFor(() => expect(api.archiveAllActivities).toHaveBeenCalledOnce());
  });

  it("blocks mark read for an activity being marked unread", async () => {
    const archived = activity({
      id: "a1",
      title: "Secret needed: GITHUB_TOKEN",
      status: "archived",
      archivedAt: new Date().toISOString(),
    });
    let resolveUnarchive!: (value: { activity: Activity; archivedActivityIds: string[] }) => void;
    vi.mocked(api.unarchiveActivity).mockReturnValue(
      new Promise((resolve) => {
        resolveUnarchive = resolve;
      }),
    );
    vi.mocked(api.archiveActivity).mockResolvedValue({
      ...archived,
      status: "archived",
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false, staleTime: Infinity },
      },
    });
    queryClient.setQueryData<ActivityListResponse>(queryKeys.activities, {
      activities: [],
      actionRequiredCount: 0,
    });
    queryClient.setQueryData<ActivityListResponse>(queryKeys.activitiesResolved, {
      activities: [archived],
      actionRequiredCount: 0,
    });

    function StartMarkUnread() {
      const mutation = useUnarchiveActivityMutation();
      return <button onClick={() => mutation.mutate(archived.id)}>Start mark unread</button>;
    }

    render(
      <>
        <StartMarkUnread />
        <ActivityBell />
      </>,
      { wrapper: makeWrapper(queryClient) },
    );

    fireEvent.click(screen.getByRole("button", { name: "Start mark unread" }));
    await waitFor(() => expect(api.unarchiveActivity).toHaveBeenCalledWith(archived.id));
    fireEvent.click(screen.getByLabelText("Activity (1 need attention)"));

    const markRead = screen.getByRole("button", { name: "Mark read" });
    expect(markRead).toBeDisabled();
    fireEvent.click(markRead);
    expect(api.archiveActivity).not.toHaveBeenCalled();

    resolveUnarchive({
      activity: { ...archived, status: "pending", archivedAt: null },
      archivedActivityIds: [],
    });
    await waitFor(() => expect(markRead).toBeEnabled());
    fireEvent.click(markRead);
    await waitFor(() => expect(api.archiveActivity).toHaveBeenCalledWith(archived.id));
  });
});
