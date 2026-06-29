import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Activity } from "@cc/shared/schemas";

import { ActivityBell } from "./ActivityBell";

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
});
