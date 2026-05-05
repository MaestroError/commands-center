import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  completeProviderOauth: vi.fn(),
  disconnectProvider: vi.fn(),
  listProviders: vi.fn(),
  startProviderOauth: vi.fn(),
  submitProviderApiKey: vi.fn(),
}));

import {
  completeProviderOauth,
  disconnectProvider,
  listProviders,
  startProviderOauth,
  submitProviderApiKey,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import { useProviderMutations, useProvidersQuery } from "./use-providers-query";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useProvidersQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads providers through the providers query", async () => {
    vi.mocked(listProviders).mockResolvedValue([{ provider: { id: "openai", name: "OpenAI" } }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useProvidersQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([{ provider: { id: "openai", name: "OpenAI" } }]);
    });
  });

  it("runs provider mutations and invalidates providers on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    vi.mocked(submitProviderApiKey).mockResolvedValue(undefined);
    vi.mocked(startProviderOauth).mockResolvedValue({ url: "https://example.com/oauth" });
    vi.mocked(completeProviderOauth).mockResolvedValue({ connected: true });
    vi.mocked(disconnectProvider).mockResolvedValue(undefined);

    const { result } = renderHook(() => useProviderMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.connectApiKey.mutateAsync({ providerId: "openai", apiKey: "secret" });
      await result.current.startOauth.mutateAsync({
        providerId: "github",
        method: 1,
        inputs: { scope: "repo" },
      });
      await result.current.completeOauth.mutateAsync({
        providerId: "github",
        method: 1,
        code: "code",
      });
      await result.current.disconnect.mutateAsync({ providerId: "openai" });
    });

    expect(submitProviderApiKey).toHaveBeenCalledWith("openai", "secret");
    expect(startProviderOauth).toHaveBeenCalledWith("github", 1, { scope: "repo" });
    expect(completeProviderOauth).toHaveBeenCalledWith("github", 1, "code");
    expect(disconnectProvider).toHaveBeenCalledWith("openai");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.providers });
  });

  it("skips invalidation when oauth completion does not connect the provider", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    vi.mocked(completeProviderOauth).mockResolvedValue({ connected: false });

    const { result } = renderHook(() => useProviderMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.completeOauth.mutateAsync({
        providerId: "github",
        method: 2,
        code: "code",
      });
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
