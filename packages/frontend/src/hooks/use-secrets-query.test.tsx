import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  deleteSecret: vi.fn(),
  listSecrets: vi.fn(),
  setSecret: vi.fn(),
}));

import { deleteSecret, listSecrets, setSecret } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import { useSecretMutations, useSecretsQuery } from "./use-secrets-query";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useSecretsQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads secrets through the secrets query", async () => {
    vi.mocked(listSecrets).mockResolvedValue([
      {
        key: "OPENAI_API_KEY",
        isSet: true,
        stale: false,
        updatedAt: "2026-05-05T10:00:00.000Z",
      },
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useSecretsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([
        {
          key: "OPENAI_API_KEY",
          isSet: true,
          stale: false,
          updatedAt: "2026-05-05T10:00:00.000Z",
        },
      ]);
    });
  });

  it("invalidates secrets and mcp servers after setting and removing a secret", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    vi.mocked(setSecret).mockResolvedValue(undefined);
    vi.mocked(deleteSecret).mockResolvedValue(undefined);

    const { result } = renderHook(() => useSecretMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.set.mutateAsync({ key: "OPENAI_API_KEY", value: "secret" });
      await result.current.remove.mutateAsync({ key: "OPENAI_API_KEY" });
    });

    expect(setSecret).toHaveBeenCalledWith("OPENAI_API_KEY", "secret");
    expect(deleteSecret).toHaveBeenCalledWith("OPENAI_API_KEY");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.secrets });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.mcpServers });
  });
});
