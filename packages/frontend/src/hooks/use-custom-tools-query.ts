import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteAgentCustomTool,
  copyAgentCustomToolToGlobal,
  copyCustomToolToAgents,
  createCustomTool,
  deleteCustomTool,
  listAgentCustomTools,
  listCustomTools,
  moveAgentCustomToolToGlobal,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type {
  CopyCustomToolToAgentsInput,
  CreateCustomToolInput,
  ImportAgentCustomToolInput,
} from "@cc/shared/schemas";

export function useCustomToolsQuery() {
  return useQuery({
    queryKey: queryKeys.customTools,
    queryFn: () => listCustomTools(),
  });
}

export function useAgentCustomToolsQuery(agentId?: string) {
  return useQuery({
    queryKey: queryKeys.agentCustomTools(agentId ?? "unknown"),
    queryFn: () => listAgentCustomTools(agentId ?? ""),
    enabled: agentId !== undefined,
  });
}

export function useCustomToolMutations() {
  const queryClient = useQueryClient();

  const invalidate = async (agentIds: string[] = []) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.customTools }),
      queryClient.invalidateQueries({ queryKey: queryKeys.agentCatalog }),
      ...agentIds.map((agentId) =>
        queryClient.invalidateQueries({ queryKey: queryKeys.agentCustomTools(agentId) }),
      ),
    ]);
  };

  return {
    create: useMutation({
      mutationFn: (input: CreateCustomToolInput) => createCustomTool(input),
      onSuccess: async () => {
        await invalidate();
      },
    }),
    delete: useMutation({
      mutationFn: (slug: string) => deleteCustomTool(slug),
      onSuccess: async () => {
        await invalidate();
      },
    }),
    copyToAgents: useMutation({
      mutationFn: ({ slug, input }: { slug: string; input: CopyCustomToolToAgentsInput }) =>
        copyCustomToolToAgents(slug, input),
      onSuccess: async (_result, variables) => {
        await invalidate(variables.input.agentIds);
      },
    }),
    copyAgentToGlobal: useMutation({
      mutationFn: ({
        agentId,
        slug,
        input,
      }: {
        agentId: string;
        slug: string;
        input: ImportAgentCustomToolInput;
      }) => copyAgentCustomToolToGlobal(agentId, slug, input),
      onSuccess: async (_result, variables) => {
        await invalidate([variables.agentId]);
      },
    }),
    moveAgentToGlobal: useMutation({
      mutationFn: ({
        agentId,
        slug,
        input,
      }: {
        agentId: string;
        slug: string;
        input: ImportAgentCustomToolInput;
      }) => moveAgentCustomToolToGlobal(agentId, slug, input),
      onSuccess: async (_result, variables) => {
        await invalidate([variables.agentId]);
      },
    }),
    deleteAgentTool: useMutation({
      mutationFn: ({ agentId, slug }: { agentId: string; slug: string }) =>
        deleteAgentCustomTool(agentId, slug),
      onSuccess: async (_result, variables) => {
        await invalidate([variables.agentId]);
      },
    }),
  };
}
