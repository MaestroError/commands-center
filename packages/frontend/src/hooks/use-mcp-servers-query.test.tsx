import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  activateMcpServer: vi.fn(),
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
  activateMcpServer,
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
import type { CreateMcpServerInput, McpServer, UpdateMcpServerInput } from "@cc/shared/schemas";

import { useMcpServerMutations, useMcpServersQuery } from "./use-mcp-servers-query";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function buildMcpServer(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: "server-1",
    name: "Filesystem",
    enabled: true,
    config: {
      transport: "stdio",
      command: ["npx", "mcp-server"],
      environment: {},
    },
    missingSecrets: [],
    requiresEngineRestart: false,
    runtimeStatus: { status: "connected" },
    tools: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("useMcpServersQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads mcp servers through the servers query", async () => {
    vi.mocked(listMcpServers).mockResolvedValue([buildMcpServer()]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useMcpServersQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([buildMcpServer()]);
    });
  });

  it("runs server mutations and updates cached servers on refresh", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const setQueryData = vi.spyOn(queryClient, "setQueryData");
    const refreshedServers = [buildMcpServer()];

    vi.mocked(createMcpServer).mockResolvedValue(buildMcpServer());
    vi.mocked(activateMcpServer).mockResolvedValue(buildMcpServer());
    vi.mocked(refreshMcpServers).mockResolvedValue(refreshedServers);
    vi.mocked(updateMcpServer).mockResolvedValue(buildMcpServer({ name: "Updated" }));
    vi.mocked(setMcpServerEnabled).mockResolvedValue(buildMcpServer());
    vi.mocked(deleteMcpServer).mockResolvedValue(undefined);
    vi.mocked(startMcpAuth).mockResolvedValue({ authorizationUrl: "https://example.com" });
    vi.mocked(authenticateMcp).mockResolvedValue(buildMcpServer());
    vi.mocked(completeMcpAuth).mockResolvedValue(buildMcpServer());
    vi.mocked(removeMcpAuth).mockResolvedValue({ success: true });

    const createInput: CreateMcpServerInput = {
      name: "Filesystem",
      enabled: true,
      config: {
        transport: "stdio",
        command: ["npx", "mcp-server"],
        environment: {},
      },
    };
    const updateInput: UpdateMcpServerInput = {
      name: "Updated",
      config: {
        transport: "stdio",
        command: ["npx", "mcp-server"],
        environment: {},
      },
    };

    const { result } = renderHook(() => useMcpServerMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.create.mutateAsync({
        ...createInput,
      });
      await result.current.refresh.mutateAsync();
      await result.current.update.mutateAsync({ id: "server-1", input: updateInput });
      await result.current.setEnabled.mutateAsync({ id: "server-1", enabled: true });
      await result.current.activate.mutateAsync({ id: "server-1", restartEngine: true });
      await result.current.remove.mutateAsync({ id: "server-1" });
      await result.current.startAuth.mutateAsync({ id: "server-1" });
      await result.current.authenticate.mutateAsync({ id: "server-1" });
      await result.current.completeAuth.mutateAsync({ id: "server-1", code: "code" });
      await result.current.removeAuth.mutateAsync({ id: "server-1" });
    });

    expect(createMcpServer).toHaveBeenCalled();
    expect(refreshMcpServers).toHaveBeenCalled();
    expect(updateMcpServer).toHaveBeenCalledWith("server-1", updateInput);
    expect(setMcpServerEnabled).toHaveBeenCalledWith("server-1", true);
    expect(activateMcpServer).toHaveBeenCalledWith("server-1", { restartEngine: true });
    expect(deleteMcpServer).toHaveBeenCalledWith("server-1");
    expect(startMcpAuth).toHaveBeenCalledWith("server-1");
    expect(authenticateMcp).toHaveBeenCalledWith("server-1");
    expect(completeMcpAuth).toHaveBeenCalledWith("server-1", "code");
    expect(removeMcpAuth).toHaveBeenCalledWith("server-1");
    expect(setQueryData).toHaveBeenCalledWith(queryKeys.mcpServers, refreshedServers);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.mcpServers });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.secrets });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.specialistCatalog });
  });
});
