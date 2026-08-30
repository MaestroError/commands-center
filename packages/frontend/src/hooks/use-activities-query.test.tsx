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
  useActivityReadStateError,
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

  it("replaces an existing resolved cache entry when archiving", async () => {
    const request = deferred<Activity>();
    vi.mocked(archiveActivity).mockReturnValue(request.promise);
    const queryClient = createQueryClient();
    seedCaches(queryClient);
    queryClient.setQueryData<ActivityListResponse>(queryKeys.activitiesResolved, {
      activities: [resolvedAttentionActivity, { ...infoActivity, status: "archived" }],
      actionRequiredCount: 0,
    });
    const { result } = renderHook(() => useArchiveActivityMutation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => result.current.mutate(infoActivity.id));

    await waitFor(() => expect(archiveActivity).toHaveBeenCalledWith(infoActivity.id));
    expect(
      readResolved(queryClient).activities.filter(({ id }) => id === infoActivity.id),
    ).toHaveLength(1);
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

  it("clears an earlier archive error after a successful retry", async () => {
    vi.mocked(archiveActivity)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ...infoActivity, status: "archived" });
    const queryClient = createQueryClient();
    seedCaches(queryClient);
    const { result } = renderHook(
      () => ({ error: useActivityReadStateError(), mutation: useArchiveActivityMutation() }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => result.current.mutation.mutate(infoActivity.id));
    await waitFor(() => expect(result.current.error).toBe(true));

    act(() => result.current.mutation.mutate(infoActivity.id));
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
    expect(result.current.error).toBe(false);
    expect(archiveActivity).toHaveBeenCalledTimes(2);
  });

  it("clears an earlier archive error after a different read-state operation succeeds", async () => {
    vi.mocked(archiveActivity).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(unarchiveActivity).mockResolvedValueOnce({
      activity: { ...resolvedAttentionActivity, status: "pending", archivedAt: null },
      archivedActivityIds: [],
    });
    const queryClient = createQueryClient();
    seedCaches(queryClient);
    const { result } = renderHook(
      () => ({
        error: useActivityReadStateError(),
        archive: useArchiveActivityMutation(),
        unarchive: useUnarchiveActivityMutation(),
      }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => result.current.archive.mutate(infoActivity.id));
    await waitFor(() => expect(result.current.error).toBe(true));

    act(() => result.current.unarchive.mutate(resolvedAttentionActivity.id));
    await waitFor(() => expect(result.current.unarchive.isSuccess).toBe(true));
    expect(result.current.error).toBe(false);
  });

  it("optimistically moves an archived activity to pending when unarchiving", async () => {
    const request = deferred<{ activity: Activity; archivedActivityIds: string[] }>();
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
    expect(readPending(queryClient).actionRequiredCount).toBe(2);
    expect(readResolved(queryClient).activities).toEqual([]);
    request.resolve({
      activity: { ...resolvedAttentionActivity, status: "pending", archivedAt: null },
      archivedActivityIds: [],
    });
  });

  it("removes the pending dedupe collision returned by unarchive", async () => {
    const request = deferred<{ activity: Activity; archivedActivityIds: string[] }>();
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
    request.resolve({
      activity: { ...resolvedAttentionActivity, status: "pending", archivedAt: null },
      archivedActivityIds: [attentionActivity.id],
    });

    await waitFor(() =>
      expect(readPending(queryClient).activities.map(({ id }) => id)).toEqual([
        resolvedAttentionActivity.id,
        infoActivity.id,
      ]),
    );
    expect(readPending(queryClient).actionRequiredCount).toBe(1);
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

  it("clears an earlier unarchive error after a successful retry", async () => {
    vi.mocked(unarchiveActivity)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        activity: { ...resolvedAttentionActivity, status: "pending", archivedAt: null },
        archivedActivityIds: [],
      });
    const queryClient = createQueryClient();
    seedCaches(queryClient);
    const { result } = renderHook(
      () => ({ error: useActivityReadStateError(), mutation: useUnarchiveActivityMutation() }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => result.current.mutation.mutate(resolvedAttentionActivity.id));
    await waitFor(() => expect(result.current.error).toBe(true));

    act(() => result.current.mutation.mutate(resolvedAttentionActivity.id));
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
    expect(result.current.error).toBe(false);
    expect(unarchiveActivity).toHaveBeenCalledTimes(2);
  });

  it("serializes opposing read-state mutations across hook instances", async () => {
    const archiveRequest = deferred<Activity>();
    vi.mocked(archiveActivity).mockReturnValue(archiveRequest.promise);
    vi.mocked(unarchiveActivity).mockResolvedValue({
      activity: { ...resolvedAttentionActivity, status: "pending", archivedAt: null },
      archivedActivityIds: [],
    });
    const queryClient = createQueryClient();
    seedCaches(queryClient);
    const { result } = renderHook(
      () => ({
        archive: useArchiveActivityMutation(),
        unarchive: useUnarchiveActivityMutation(),
      }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => result.current.archive.mutate(infoActivity.id));
    await waitFor(() => expect(archiveActivity).toHaveBeenCalledWith(infoActivity.id));
    act(() => result.current.unarchive.mutate(resolvedAttentionActivity.id));

    expect(unarchiveActivity).not.toHaveBeenCalled();

    archiveRequest.resolve({ ...infoActivity, status: "archived" });
    await waitFor(() =>
      expect(unarchiveActivity).toHaveBeenCalledWith(resolvedAttentionActivity.id),
    );
  });

  it("serializes mark unread behind archive-all", async () => {
    const archiveAllRequest = deferred<{ archivedCount: number }>();
    vi.mocked(archiveAllActivities).mockReturnValue(archiveAllRequest.promise);
    vi.mocked(unarchiveActivity).mockResolvedValue({
      activity: { ...resolvedAttentionActivity, status: "pending", archivedAt: null },
      archivedActivityIds: [],
    });
    const queryClient = createQueryClient();
    seedCaches(queryClient);
    const { result } = renderHook(
      () => ({
        archiveAll: useArchiveAllActivitiesMutation(),
        unarchive: useUnarchiveActivityMutation(),
      }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => result.current.archiveAll.mutate());
    await waitFor(() => expect(archiveAllActivities).toHaveBeenCalled());
    act(() => result.current.unarchive.mutate(resolvedAttentionActivity.id));

    expect(unarchiveActivity).not.toHaveBeenCalled();

    archiveAllRequest.resolve({ archivedCount: 2 });
    await waitFor(() =>
      expect(unarchiveActivity).toHaveBeenCalledWith(resolvedAttentionActivity.id),
    );
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

  it("replaces resolved cache collisions when archiving all", async () => {
    const request = deferred<{ archivedCount: number }>();
    vi.mocked(archiveAllActivities).mockReturnValue(request.promise);
    const queryClient = createQueryClient();
    seedCaches(queryClient);
    queryClient.setQueryData<ActivityListResponse>(queryKeys.activitiesResolved, {
      activities: [resolvedAttentionActivity, { ...attentionActivity, status: "archived" }],
      actionRequiredCount: 0,
    });
    const { result } = renderHook(() => useArchiveAllActivitiesMutation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => result.current.mutate());

    await waitFor(() => expect(archiveAllActivities).toHaveBeenCalledOnce());
    expect(
      readResolved(queryClient).activities.filter(({ id }) => id === attentionActivity.id),
    ).toHaveLength(1);
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

  it("clears an earlier archive-all error after a successful retry", async () => {
    vi.mocked(archiveAllActivities)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ archivedCount: 2 });
    const queryClient = createQueryClient();
    seedCaches(queryClient);
    const { result } = renderHook(
      () => ({ error: useActivityReadStateError(), mutation: useArchiveAllActivitiesMutation() }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => result.current.mutation.mutate());
    await waitFor(() => expect(result.current.error).toBe(true));

    act(() => result.current.mutation.mutate());
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
    expect(result.current.error).toBe(false);
    expect(archiveAllActivities).toHaveBeenCalledTimes(2);
  });

  it("serializes overlapping archives and rolls back only the failed activity", async () => {
    const first = deferred<Activity>();
    const second = deferred<Activity>();
    vi.mocked(archiveActivity)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const queryClient = createQueryClient();
    seedCaches(queryClient);
    const { result } = renderHook(() => useArchiveActivityMutation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => result.current.mutate(infoActivity.id));
    act(() => result.current.mutate(attentionActivity.id));
    await waitFor(() => expect(archiveActivity).toHaveBeenCalledTimes(1));

    first.reject(new Error("offline"));
    await waitFor(() => expect(archiveActivity).toHaveBeenCalledTimes(2));
    second.resolve({ ...attentionActivity, status: "archived" });
    await waitFor(() =>
      expect(readPending(queryClient).activities.map(({ id }) => id)).toEqual([infoActivity.id]),
    );
    expect(readResolved(queryClient).activities.map(({ id }) => id)).toEqual([
      resolvedAttentionActivity.id,
      attentionActivity.id,
    ]);
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
