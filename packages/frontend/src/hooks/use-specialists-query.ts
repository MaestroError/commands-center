import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  archiveSpecialist,
  createSpecialist,
  getSpecialistBySlug,
  getSpecialistCatalog,
  listSpecialists,
  updateSpecialist,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { Specialist, CreateSpecialistInput, UpdateSpecialistInput } from "@cc/shared/schemas";

export function useSpecialistsQuery() {
  return useQuery({
    queryKey: queryKeys.specialists,
    queryFn: () => listSpecialists(),
  });
}

export function useSpecialistQuery(slug?: string) {
  return useQuery({
    queryKey: queryKeys.specialistBySlug(slug ?? "new"),
    queryFn: () => getSpecialistBySlug(slug ?? ""),
    enabled: slug !== undefined,
  });
}

export function useSpecialistCatalogQuery() {
  return useQuery({
    queryKey: queryKeys.specialistCatalog,
    queryFn: () => getSpecialistCatalog(),
  });
}

export function useSpecialistMutations() {
  const queryClient = useQueryClient();

  const updateSpecialistsList = (updater: (agents: Specialist[]) => Specialist[]) => {
    queryClient.setQueryData(queryKeys.specialists, (current: Specialist[] | undefined) =>
      updater(current ?? []),
    );
  };

  const invalidateAgents = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.specialists }),
      queryClient.invalidateQueries({ queryKey: queryKeys.specialistCatalog }),
      queryClient.invalidateQueries({ queryKey: queryKeys.customTools }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSkills }),
    ]);
  };

  return {
    create: useMutation({
      mutationFn: (input: CreateSpecialistInput) => createSpecialist(input),
      onSuccess: async (agent) => {
        updateSpecialistsList((current) => [
          agent,
          ...current.filter((entry) => entry.id !== agent.id),
        ]);
        await invalidateAgents();
        queryClient.setQueryData(queryKeys.specialistBySlug(agent.slug), agent);
      },
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateSpecialistInput }) =>
        updateSpecialist(id, input),
      onSuccess: async (agent) => {
        updateSpecialistsList((current) =>
          current.map((entry) => (entry.id === agent.id ? agent : entry)),
        );
        await invalidateAgents();
        queryClient.setQueryData(queryKeys.specialistBySlug(agent.slug), agent);
        await queryClient.invalidateQueries({
          queryKey: queryKeys.specialistCustomTools(agent.id),
        });
      },
    }),
    archive: useMutation({
      mutationFn: (id: string) => archiveSpecialist(id),
      onSuccess: async (agent) => {
        updateSpecialistsList((current) => current.filter((entry) => entry.id !== agent.id));
        await invalidateAgents();
      },
    }),
  };
}
