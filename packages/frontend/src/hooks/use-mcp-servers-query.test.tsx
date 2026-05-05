import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  authenticateMcp: vi.fn(),
  completeMcpAuth: vi.fn(),
  createMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
  listMcpServers: vi.fn(),
  refreshMcpServers: vi.fn(),
  removeMcpAuth: vi.fn(),
  setMcpServerEnabled: vi.fn(),
  startMcpAuth: vi.fn(),
  updateMcpServer: vi.fn(),
}));

import {
  authenticateMcp,
  completeMcpAuth,
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  refreshMcpServers,
  removeMcpAuth,
  setMcpServerEnabled,
  startMcpAuth,
  updateMcpServer,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import { useMcpServerMutations, useMcpServersQuery } from "./use-mcp-servers-query";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useMcpServersQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads mcp servers through the servers query", async () => {
    vi.mocked(listMcpServers).mockResolvedValue([{ id: "server-1", name: "Filesystem" }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useMcpServersQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([{ id: "server-1", name: "Filesystem" }]);
    });
  });

  it("runs server mutations and updates cached servers on refresh", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const setQueryData = vi.spyOn(queryClient, "setQueryData");
    const refreshedServers = [{ id: "server-1", name: "Filesystem" }];

    vi.mocked(createMcpServer).mockResolvedValue({ id: "server-1" });
    vi.mocked(refreshMcpServers).mockResolvedValue(refreshedServers);
    vi.mocked(updateMcpServer).mockResolvedValue({ id: "server-1" });
    vi.mocked(setMcpServerEnabled).mockResolvedValue({ id: "server-1" });
    vi.mocked(deleteMcpServer).mockResolvedValue(undefined);
    vi.mocked(startMcpAuth).mockResolvedValue({ authUrl: "https://example.com" });
    vi.mocked(authenticateMcp).mockResolvedValue({ id: "server-1" });
    vi.mocked(completeMcpAuth).mockResolvedValue({ id: "server-1" });
    vi.mocked(removeMcpAuth).mockResolvedValue(undefined);

    const { result } = renderHook(() => useMcpServerMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.create.mutateAsync({
        name: "Filesystem",
        transport: { type: "stdio", command: "npx", args: ["mcp-server"] },
        environment: [],
        headers: [],
      });
      await result.current.refresh.mutateAsync();
      await result.current.update.mutateAsync({ id: "server-1", input: { name: "Updated" } });
      await result.current.setEnabled.mutateAsync({ id: "server-1", enabled: true });
      await result.current.remove.mutateAsync({ id: "server-1" });
      await result.current.startAuth.mutateAsync({ id: "server-1" });
      await result.current.authenticate.mutateAsync({ id: "server-1" });
      await result.current.completeAuth.mutateAsync({ id: "server-1", code: "code" });
      await result.current.removeAuth.mutateAsync({ id: "server-1" });
    });

    expect(createMcpServer).toHaveBeenCalled();
    expect(refreshMcpServers).toHaveBeenCalled();
    expect(updateMcpServer).toHaveBeenCalledWith("server-1", { name: "Updated" });
    expect(setMcpServerEnabled).toHaveBeenCalledWith("server-1", true);
    expect(deleteMcpServer).toHaveBeenCalledWith("server-1");
    expect(startMcpAuth).toHaveBeenCalledWith("server-1");
    expect(authenticateMcp).toHaveBeenCalledWith("server-1");
    expect(completeMcpAuth).toHaveBeenCalledWith("server-1", "code");
    expect(removeMcpAuth).toHaveBeenCalledWith("server-1");
    expect(setQueryData).toHaveBeenCalledWith(queryKeys.mcpServers, refreshedServers);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.mcpServers });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.secrets });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.agentCatalog });
  });
});
