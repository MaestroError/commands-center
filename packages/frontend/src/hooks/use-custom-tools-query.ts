import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteSpecialistCustomTool,
  copySpecialistCustomToolToGlobal,
  copyCustomToolToSpecialists,
  createCustomTool,
  deleteCustomTool,
  listSpecialistCustomTools,
  listCustomTools,
  moveSpecialistCustomToolToGlobal,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type {
  CopyCustomToolToAgentsInput as CopyCustomToolToSpecialistsInput,
  CreateCustomToolInput,
  ImportAgentCustomToolInput as ImportSpecialistCustomToolInput,
} from "@cc/shared/schemas";

export function useCustomToolsQuery() {
  return useQuery({
    queryKey: queryKeys.customTools,
    queryFn: () => listCustomTools(),
  });
}

export function useSpecialistCustomToolsQuery(agentId?: string) {
  return useQuery({
    queryKey: queryKeys.specialistCustomTools(agentId ?? "unknown"),
    queryFn: () => listSpecialistCustomTools(agentId ?? ""),
    enabled: agentId !== undefined,
  });
}

export function useCustomToolMutations() {
  const queryClient = useQueryClient();

  const invalidate = async (agentIds: string[] = []) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.customTools }),
      queryClient.invalidateQueries({ queryKey: queryKeys.specialistCatalog }),
      ...agentIds.map((agentId) =>
        queryClient.invalidateQueries({ queryKey: queryKeys.specialistCustomTools(agentId) }),
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
    copyToSpecialists: useMutation({
      mutationFn: ({ slug, input }: { slug: string; input: CopyCustomToolToSpecialistsInput }) =>
        copyCustomToolToSpecialists(slug, input),
      onSuccess: async (_result, variables) => {
        await invalidate(variables.input.agentIds);
      },
    }),
    copySpecialistToGlobal: useMutation({
      mutationFn: ({
        agentId,
        slug,
        input,
      }: {
        agentId: string;
        slug: string;
        input: ImportSpecialistCustomToolInput;
      }) => copySpecialistCustomToolToGlobal(agentId, slug, input),
      onSuccess: async (_result, variables) => {
        await invalidate([variables.agentId]);
      },
    }),
    moveSpecialistToGlobal: useMutation({
      mutationFn: ({
        agentId,
        slug,
        input,
      }: {
        agentId: string;
        slug: string;
        input: ImportSpecialistCustomToolInput;
      }) => moveSpecialistCustomToolToGlobal(agentId, slug, input),
      onSuccess: async (_result, variables) => {
        await invalidate([variables.agentId]);
      },
    }),
    deleteSpecialistTool: useMutation({
      mutationFn: ({ agentId, slug }: { agentId: string; slug: string }) =>
        deleteSpecialistCustomTool(agentId, slug),
      onSuccess: async (_result, variables) => {
        await invalidate([variables.agentId]);
      },
    }),
  };
}
