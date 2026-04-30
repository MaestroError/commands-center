import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  archiveAgent,
  createAgent,
  getAgentBySlug,
  getAgentCatalog,
  listAgents,
  updateAgent,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { Agent, CreateAgentInput, UpdateAgentInput } from "@cc/shared/schemas";

export function useAgentsQuery() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => listAgents(),
  });
}

export function useAgentQuery(slug?: string) {
  return useQuery({
    queryKey: queryKeys.agentBySlug(slug ?? "new"),
    queryFn: () => getAgentBySlug(slug ?? ""),
    enabled: slug !== undefined,
  });
}

export function useAgentCatalogQuery() {
  return useQuery({
    queryKey: queryKeys.agentCatalog,
    queryFn: () => getAgentCatalog(),
  });
}

export function useAgentMutations() {
  const queryClient = useQueryClient();

  const updateAgentsList = (updater: (agents: Agent[]) => Agent[]) => {
    queryClient.setQueryData(queryKeys.agents, (current: Agent[] | undefined) =>
      updater(current ?? []),
    );
  };

  const invalidateAgents = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.agents }),
      queryClient.invalidateQueries({ queryKey: queryKeys.agentCatalog }),
      queryClient.invalidateQueries({ queryKey: queryKeys.customTools }),
    ]);
  };

  return {
    create: useMutation({
      mutationFn: (input: CreateAgentInput) => createAgent(input),
      onSuccess: async (agent) => {
        updateAgentsList((current) => [agent, ...current.filter((entry) => entry.id !== agent.id)]);
        await invalidateAgents();
        queryClient.setQueryData(queryKeys.agentBySlug(agent.slug), agent);
      },
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateAgentInput }) =>
        updateAgent(id, input),
      onSuccess: async (agent) => {
        updateAgentsList((current) =>
          current.map((entry) => (entry.id === agent.id ? agent : entry)),
        );
        await invalidateAgents();
        queryClient.setQueryData(queryKeys.agentBySlug(agent.slug), agent);
        await queryClient.invalidateQueries({ queryKey: queryKeys.agentCustomTools(agent.id) });
      },
    }),
    archive: useMutation({
      mutationFn: (id: string) => archiveAgent(id),
      onSuccess: async (agent) => {
        updateAgentsList((current) => current.filter((entry) => entry.id !== agent.id));
        await invalidateAgents();
      },
    }),
  };
}
