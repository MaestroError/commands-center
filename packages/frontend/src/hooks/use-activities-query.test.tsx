import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Activity, ActivityListResponse } from "@cc/shared/schemas";

vi.mock("@/lib/api", () => ({
  archiveActivity: vi.fn(),
  archiveAllActivities: vi.fn(),
  fillSecret: vi.fn(),
  getActivities: vi.fn(),
  unarchiveActivity: vi.fn(),
}));

import { archiveActivity, archiveAllActivities, unarchiveActivity } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import {
  useArchiveActivityMutation,
  useArchiveAllActivitiesMutation,
  useUnarchiveActivityMutation,
} from "./use-activities-query";

const infoActivity = activity({
  id: "info-1",
  level: "info",
  status: "pending",
  createdAt: "2026-08-27T10:00:00.000Z",
});
const attentionActivity = activity({
  id: "attention-1",
  level: "action_required",
  status: "pending",
  createdAt: "2026-08-27T11:00:00.000Z",
});
const resolvedAttentionActivity = activity({
  id: "resolved-attention-1",
  level: "action_required",
  status: "archived",
  createdAt: "2026-08-27T09:00:00.000Z",
});

describe("activity read-state mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("optimistically moves an archived activity from pending to resolved", async () => {
    const request = deferred<Activity>();
    vi.mocked(archiveActivity).mockReturnValue(request.promise);
    const queryClient = createQueryClient();
    seedCaches(queryClient);
    const { result } = renderHook(() => useArchiveActivityMutation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => result.current.mutate(infoActivity.id));

    await waitFor(() => expect(archiveActivity).toHaveBeenCalledWith(infoActivity.id));
    expect(readPending(queryClient).activities.map(({ id }) => id)).toEqual([attentionActivity.id]);
    expect(readResolved(queryClient).activities.map(({ id }) => id)).toEqual([
      resolvedAttentionActivity.id,
      infoActivity.id,
    ]);
    request.resolve({ ...infoActivity, status: "archived" });
  });

  it("decrements the attention count only when archiving action-required activity", async () => {
    const request = deferred<Activity>();
    vi.mocked(archiveActivity).mockReturnValue(request.promise);
    const queryClient = createQueryClient();
    seedCaches(queryClient);
    const { result } = renderHook(() => useArchiveActivityMutation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => result.current.mutate(attentionActivity.id));

    await waitFor(() => expect(readPending(queryClient).actionRequiredCount).toBe(0));
    request.resolve({ ...attentionActivity, status: "archived" });
  });

  it("restores both caches when archive fails", async () => {
    vi.mocked(archiveActivity).mockRejectedValue(new Error("offline"));
    const queryClient = createQueryClient();
    const original = seedCaches(queryClient);
    const { result } = renderHook(() => useArchiveActivityMutation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => result.current.mutate(infoActivity.id));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(readPending(queryClient)).toEqual(original.pending);
    expect(readResolved(queryClient)).toEqual(original.resolved);
  });

  it("optimistically reinserts unread activity in canonical order", async () => {
    const request = deferred<Activity>();
    vi.mocked(unarchiveActivity).mockReturnValue(request.promise);
    const queryClient = createQueryClient();
    seedCaches(queryClient);
    const { result } = renderHook(() => useUnarchiveActivityMutation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => result.current.mutate(resolvedAttentionActivity.id));

    await waitFor(() =>
      expect(unarchiveActivity).toHaveBeenCalledWith(resolvedAttentionActivity.id),
    );
    expect(readPending(queryClient).activities.map(({ id }) => id)).toEqual([
      resolvedAttentionActivity.id,
      infoActivity.id,
      attentionActivity.id,
    ]);
    expect(readResolved(queryClient).activities).toEqual([]);
    request.resolve({ ...resolvedAttentionActivity, status: "pending", archivedAt: null });
  });

  it("increments the attention count when restoring action-required activity", async () => {
    const request = deferred<Activity>();
    vi.mocked(unarchiveActivity).mockReturnValue(request.promise);
    const queryClient = createQueryClient();
    seedCaches(queryClient);
    const { result } = renderHook(() => useUnarchiveActivityMutation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => result.current.mutate(resolvedAttentionActivity.id));

    await waitFor(() => expect(readPending(queryClient).actionRequiredCount).toBe(2));
    request.resolve({ ...resolvedAttentionActivity, status: "pending", archivedAt: null });
  });

  it("restores both caches when unarchive fails", async () => {
    vi.mocked(unarchiveActivity).mockRejectedValue(new Error("offline"));
    const queryClient = createQueryClient();
    const original = seedCaches(queryClient);
    const { result } = renderHook(() => useUnarchiveActivityMutation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => result.current.mutate(resolvedAttentionActivity.id));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(readPending(queryClient)).toEqual(original.pending);
    expect(readResolved(queryClient)).toEqual(original.resolved);
  });

  it("optimistically moves every pending activity to resolved", async () => {
    const request = deferred<{ archivedCount: number }>();
    vi.mocked(archiveAllActivities).mockReturnValue(request.promise);
    const queryClient = createQueryClient();
    seedCaches(queryClient);
    const { result } = renderHook(() => useArchiveAllActivitiesMutation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => result.current.mutate());

    await waitFor(() => expect(archiveAllActivities).toHaveBeenCalledOnce());
    expect(readPending(queryClient)).toEqual({ activities: [], actionRequiredCount: 0 });
    expect(readResolved(queryClient).activities.map(({ id }) => id)).toEqual([
      resolvedAttentionActivity.id,
      infoActivity.id,
      attentionActivity.id,
    ]);
    request.resolve({ archivedCount: 2 });
  });

  it("restores both caches when archive-all fails", async () => {
    vi.mocked(archiveAllActivities).mockRejectedValue(new Error("offline"));
    const queryClient = createQueryClient();
    const original = seedCaches(queryClient);
    const { result } = renderHook(() => useArchiveAllActivitiesMutation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => result.current.mutate());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(readPending(queryClient)).toEqual(original.pending);
    expect(readResolved(queryClient)).toEqual(original.resolved);
  });
});

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function seedCaches(queryClient: QueryClient): {
  pending: ActivityListResponse;
  resolved: ActivityListResponse;
} {
  const pending = {
    activities: [infoActivity, attentionActivity],
    actionRequiredCount: 1,
  } satisfies ActivityListResponse;
  const resolved = {
    activities: [resolvedAttentionActivity],
    actionRequiredCount: 0,
  } satisfies ActivityListResponse;
  queryClient.setQueryData(queryKeys.activities, pending);
  queryClient.setQueryData(queryKeys.activitiesResolved, resolved);
  return { pending, resolved };
}

function readPending(queryClient: QueryClient): ActivityListResponse {
  const value = queryClient.getQueryData<ActivityListResponse>(queryKeys.activities);
  if (!value) throw new Error("Missing pending activity cache");
  return value;
}

function readResolved(queryClient: QueryClient): ActivityListResponse {
  const value = queryClient.getQueryData<ActivityListResponse>(queryKeys.activitiesResolved);
  if (!value) throw new Error("Missing resolved activity cache");
  return value;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve = (_value: T): void => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function activity(overrides: Pick<Activity, "id" | "level" | "status" | "createdAt">): Activity {
  return {
    body: null,
    kind: "specialist_info",
    title: overrides.id,
    payload: {},
    updatedAt: overrides.createdAt,
    archivedAt: overrides.status === "archived" ? overrides.createdAt : null,
    ...overrides,
  };
}
