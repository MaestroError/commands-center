import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Activity } from "@cc/shared/schemas";

import { ActivityThread } from "./ActivityThread";

import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getActivities: vi.fn(),
  archiveActivity: vi.fn(),
}));

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function activity(overrides: Partial<Activity> & { id: string; title: string }): Activity {
  return {
    kind: "task_run_failed",
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
});

describe("ActivityThread", () => {
  it("shows the empty state when there are no activities", async () => {
    vi.mocked(api.getActivities).mockResolvedValue({ activities: [], actionRequiredCount: 0 });

    render(<ActivityThread />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText("You're all caught up")).toBeInTheDocument();
    });
  });

  it("renders activity cards and marks one read", async () => {
    vi.mocked(api.getActivities).mockResolvedValue({
      activities: [activity({ id: "a1", title: "Run failed" })],
      actionRequiredCount: 1,
    });
    vi.mocked(api.archiveActivity).mockResolvedValue(
      activity({ id: "a1", title: "Run failed", status: "archived" }),
    );

    render(<ActivityThread />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Run failed")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Mark read"));
    await waitFor(() => {
      expect(api.archiveActivity).toHaveBeenCalledWith("a1");
    });
  });
});
