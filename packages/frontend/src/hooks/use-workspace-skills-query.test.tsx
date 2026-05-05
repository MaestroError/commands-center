import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  createWorkspaceSkill: vi.fn(),
  deleteWorkspaceSkill: vi.fn(),
  listWorkspaceSkills: vi.fn(),
  updateWorkspaceSkillCategory: vi.fn(),
  uploadWorkspaceSkill: vi.fn(),
}));

import {
  createWorkspaceSkill,
  deleteWorkspaceSkill,
  listWorkspaceSkills,
  updateWorkspaceSkillCategory,
  uploadWorkspaceSkill,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { WorkspaceSkill } from "@cc/shared/schemas";

import { useWorkspaceSkillMutations, useWorkspaceSkillsQuery } from "./use-workspace-skills-query";

function buildWorkspaceSkill(overrides: Partial<WorkspaceSkill> = {}): WorkspaceSkill {
  return {
    name: "Custom skill",
    slug: "custom-skill",
    description: "Do the thing",
    category: "general",
    metadata: {},
    detailsMarkdown: "# Custom skill",
    files: ["SKILL.md"],
    ...overrides,
  };
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useWorkspaceSkillsQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads workspace skills through the workspace skills query", async () => {
    vi.mocked(listWorkspaceSkills).mockResolvedValue([buildWorkspaceSkill()]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useWorkspaceSkillsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([buildWorkspaceSkill()]);
    });
  });

  it("runs workspace skill mutations and invalidates dependent queries", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    vi.mocked(createWorkspaceSkill).mockResolvedValue({
      skill: buildWorkspaceSkill(),
      overwritten: false,
    });
    vi.mocked(uploadWorkspaceSkill).mockResolvedValue({
      skill: buildWorkspaceSkill(),
      overwritten: false,
    });
    vi.mocked(deleteWorkspaceSkill).mockResolvedValue(undefined);
    vi.mocked(updateWorkspaceSkillCategory).mockResolvedValue({
      skill: buildWorkspaceSkill({ category: "ops" }),
      overwritten: false,
    });

    const { result } = renderHook(() => useWorkspaceSkillMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.create.mutateAsync({
        name: "Custom skill",
        description: "Do the thing",
        category: "general",
      });
      await result.current.upload.mutateAsync({
        entries: [
          {
            name: "SKILL.md",
            relativePath: "custom-skill/SKILL.md",
            contentBase64: "cHJvbXB0",
            sizeBytes: 6,
          },
        ],
        overwrite: false,
      });
      await result.current.delete.mutateAsync("custom-skill");
      await result.current.updateCategory.mutateAsync({
        slug: "custom-skill",
        body: { category: "ops" },
      });
    });

    expect(createWorkspaceSkill).toHaveBeenCalled();
    expect(uploadWorkspaceSkill).toHaveBeenCalled();
    expect(deleteWorkspaceSkill).toHaveBeenCalledWith("custom-skill");
    expect(updateWorkspaceSkillCategory).toHaveBeenCalledWith("custom-skill", { category: "ops" });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.workspaceSkills });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.agentCatalog });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.agents });
  });
});
