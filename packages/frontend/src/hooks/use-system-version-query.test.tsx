import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  checkSystemVersion: vi.fn(),
  getSystemUpdatePreferences: vi.fn(),
  getSystemVersion: vi.fn(),
  updateSystem: vi.fn(),
  updateSystemUpdatePreferences: vi.fn(),
}));

import {
  checkSystemVersion,
  getSystemUpdatePreferences,
  getSystemVersion,
  updateSystem,
  updateSystemUpdatePreferences,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import {
  useSystemUpdateMutation,
  useSystemUpdatePreferencesMutation,
  useSystemUpdatePreferencesQuery,
  useSystemVersionCheckMutation,
  useSystemVersionQuery,
} from "./use-system-version-query";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useSystemVersionQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the cached system version", async () => {
    vi.mocked(getSystemVersion).mockResolvedValue({
      current: "1.0.0",
      latest: "1.1.0",
      updateAvailable: true,
      installMode: "npm-global",
      autoUpdateEnabled: false,
      autoUpdateSource: "environment",
      checkedAt: "2026-05-07T10:00:00.000Z",
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useSystemVersionQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data).toMatchObject({
        current: "1.0.0",
        latest: "1.1.0",
        updateAvailable: true,
      });
    });
  });

  it("checks the latest version on demand and updates cached state", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    vi.mocked(checkSystemVersion).mockResolvedValue({
      current: "1.0.0",
      latest: "1.2.0",
      updateAvailable: true,
      installMode: "npm-global",
      autoUpdateEnabled: false,
      autoUpdateSource: "environment",
      checkedAt: "2026-05-07T12:00:00.000Z",
    });

    const { result } = renderHook(() => useSystemVersionCheckMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(checkSystemVersion).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(queryKeys.systemVersion)).toMatchObject({
      latest: "1.2.0",
      checkedAt: "2026-05-07T12:00:00.000Z",
    });
  });

  it("invalidates cached version after applying an update", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    vi.mocked(updateSystem).mockResolvedValue({
      applied: true,
      installMode: "npm-global",
      message: "Updated commandscenter to 1.1.0. Restarting process.",
      previousVersion: "1.0.0",
      targetVersion: "1.1.0",
      restartRequired: true,
    });

    const { result } = renderHook(() => useSystemUpdateMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.systemVersion });
  });

  it("loads update preferences", async () => {
    vi.mocked(getSystemUpdatePreferences).mockResolvedValue({
      autoUpdateEnabled: false,
      autoUpdateSource: "environment",
      environmentDefault: false,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useSystemUpdatePreferencesQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({
        autoUpdateEnabled: false,
        autoUpdateSource: "environment",
        environmentDefault: false,
      });
    });
  });

  it("invalidates cached preferences and version after preference updates", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    vi.mocked(updateSystemUpdatePreferences).mockResolvedValue({
      autoUpdateEnabled: true,
      autoUpdateSource: "settings",
      environmentDefault: false,
    });

    const { result } = renderHook(() => useSystemUpdatePreferencesMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ autoUpdateEnabled: true });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.systemUpdatePreferences });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.systemVersion });
  });
});
