import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  getEngineStatus: vi.fn(),
  restartEngine: vi.fn(),
}));

import { getEngineStatus, restartEngine } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import {
  useEngineRestartMutation,
  useEngineStatusQuery,
  useMarkEngineRestarting,
} from "./use-engine-status-query";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const healthyStatus = { status: "healthy", message: "ok" } as never;
const restartedStatus = { status: "healthy", message: "restarted" } as never;

describe("use-engine-status-query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the engine status", async () => {
    vi.mocked(getEngineStatus).mockResolvedValue(healthyStatus);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useEngineStatusQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toEqual(healthyStatus));
  });

  it("marks the engine as restarting by invalidating the cached status", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useMarkEngineRestarting(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => result.current());

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.engineStatus });
  });

  it("writes the restarted status into the cache and invalidates on settle", async () => {
    vi.mocked(restartEngine).mockResolvedValue(restartedStatus);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const setSpy = vi.spyOn(queryClient, "setQueryData");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useEngineRestartMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(setSpy).toHaveBeenCalledWith(queryKeys.engineStatus, restartedStatus);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.engineStatus });
  });
});
