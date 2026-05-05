import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  copyAgentCustomToolToGlobal: vi.fn(),
  copyCustomToolToAgents: vi.fn(),
  createCustomTool: vi.fn(),
  deleteAgentCustomTool: vi.fn(),
  deleteCustomTool: vi.fn(),
  listAgentCustomTools: vi.fn(),
  listCustomTools: vi.fn(),
  moveAgentCustomToolToGlobal: vi.fn(),
}));

import {
  copyAgentCustomToolToGlobal,
  copyCustomToolToAgents,
  createCustomTool,
  deleteAgentCustomTool,
  deleteCustomTool,
  listAgentCustomTools,
  listCustomTools,
  moveAgentCustomToolToGlobal,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import {
  useAgentCustomToolsQuery,
  useCustomToolMutations,
  useCustomToolsQuery,
} from "./use-custom-tools-query";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useCustomToolsQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads global tools through the custom tools query", async () => {
    vi.mocked(listCustomTools).mockResolvedValue([
      {
        id: "tool-1",
        slug: "release-helper",
        name: "Release Helper",
        description: "Draft release notes.",
        entryFile: "tool.ts",
        entryPath: "/tmp/tool.ts",
        directoryPath: "/tmp/release-helper",
        fingerprint: "fp-1",
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        warnings: [],
        usage: [],
      },
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useCustomToolsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([
        expect.objectContaining({ slug: "release-helper", name: "Release Helper" }),
      ]);
    });
  });

  it("skips the agent tools query until an agent id is available and then loads it", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(listAgentCustomTools).mockResolvedValue([
      {
        slug: "release-helper-copy",
        name: "Release Helper Copy",
        description: "Draft release notes.",
        entryFile: "tool.ts",
        entryPath: "/tmp/release-helper-copy/tool.ts",
        fingerprint: "fp-2",
        status: "matching",
        isManaged: true,
        sourceToolSlug: "release-helper",
        sourceFingerprint: "fp-1",
        copiedAt: "2026-01-01T00:00:00.000Z",
        warnings: [],
      },
    ]);

    const { result, rerender } = renderHook(
      ({ agentId }: { agentId?: string }) => useAgentCustomToolsQuery(agentId),
      {
        initialProps: { agentId: undefined as string | undefined },
        wrapper: createWrapper(queryClient),
      },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(listAgentCustomTools).not.toHaveBeenCalled();

    rerender({ agentId: "agent-1" });

    await waitFor(() => {
      expect(listAgentCustomTools).toHaveBeenCalledWith("agent-1");
      expect(result.current.data).toEqual([
        expect.objectContaining({ slug: "release-helper-copy", status: "matching" }),
      ]);
    });
  });

  it("runs custom tool mutations and invalidates related queries", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    vi.mocked(createCustomTool).mockResolvedValue({
      tool: {
        id: "tool-1",
        slug: "release-helper",
        name: "Release Helper",
        description: "Draft release notes.",
        entryFile: "tool.ts",
        entryPath: "/tmp/tool.ts",
        directoryPath: "/tmp/release-helper",
        fingerprint: "fp-1",
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        warnings: [],
        usage: [],
      },
      overwritten: false,
      warnings: [],
    });
    vi.mocked(deleteCustomTool).mockResolvedValue(undefined);
    vi.mocked(copyCustomToolToAgents).mockResolvedValue({
      copied: [{ agentId: "agent-1", agentSlug: "writer", overwritten: false }],
    });
    vi.mocked(copyAgentCustomToolToGlobal).mockResolvedValue({
      tool: {
        id: "tool-2",
        slug: "release-helper-global",
        name: "Release Helper Global",
        description: "Draft release notes.",
        entryFile: "tool.ts",
        entryPath: "/tmp/tool.ts",
        directoryPath: "/tmp/release-helper-global",
        fingerprint: "fp-2",
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        warnings: [],
        usage: [],
      },
      overwritten: false,
      warnings: [],
    });
    vi.mocked(moveAgentCustomToolToGlobal).mockResolvedValue({
      tool: {
        id: "tool-3",
        slug: "release-helper-moved",
        name: "Release Helper Moved",
        description: "Draft release notes.",
        entryFile: "tool.ts",
        entryPath: "/tmp/tool.ts",
        directoryPath: "/tmp/release-helper-moved",
        fingerprint: "fp-3",
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        warnings: [],
        usage: [],
      },
      overwritten: false,
      warnings: [],
    });
    vi.mocked(deleteAgentCustomTool).mockResolvedValue(undefined);

    const { result } = renderHook(() => useCustomToolMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.create.mutateAsync({
        name: "Release Helper",
        description: "Draft release notes.",
      });
      await result.current.delete.mutateAsync("release-helper");
      await result.current.copyToAgents.mutateAsync({
        slug: "release-helper",
        input: { agentIds: ["agent-1"], overwrite: false },
      });
      await result.current.copyAgentToGlobal.mutateAsync({
        agentId: "agent-1",
        slug: "release-helper-copy",
        input: { destinationName: "Release Helper Global", overwrite: false },
      });
      await result.current.moveAgentToGlobal.mutateAsync({
        agentId: "agent-1",
        slug: "release-helper-copy",
        input: { destinationName: "Release Helper Moved", overwrite: true },
      });
      await result.current.deleteAgentTool.mutateAsync({
        agentId: "agent-1",
        slug: "release-helper-copy",
      });
    });

    expect(createCustomTool).toHaveBeenCalledWith({
      name: "Release Helper",
      description: "Draft release notes.",
    });
    expect(deleteCustomTool).toHaveBeenCalledWith("release-helper");
    expect(copyCustomToolToAgents).toHaveBeenCalledWith("release-helper", {
      agentIds: ["agent-1"],
      overwrite: false,
    });
    expect(copyAgentCustomToolToGlobal).toHaveBeenCalledWith("agent-1", "release-helper-copy", {
      destinationName: "Release Helper Global",
      overwrite: false,
    });
    expect(moveAgentCustomToolToGlobal).toHaveBeenCalledWith("agent-1", "release-helper-copy", {
      destinationName: "Release Helper Moved",
      overwrite: true,
    });
    expect(deleteAgentCustomTool).toHaveBeenCalledWith("agent-1", "release-helper-copy");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.customTools });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.agentCatalog });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.agentCustomTools("agent-1"),
    });
  });
});
