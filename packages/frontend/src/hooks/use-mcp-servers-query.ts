import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  setMcpServerEnabled,
  updateMcpServer,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import type { CreateMcpServerInput, UpdateMcpServerInput } from "@cc/shared/schemas";

export function useMcpServersQuery() {
  return useQuery({
    queryKey: queryKeys.mcpServers,
    queryFn: () => listMcpServers(),
  });
}

export function useMcpServerMutations() {
  const queryClient = useQueryClient();

  const invalidateMcpServers = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers }),
      queryClient.invalidateQueries({ queryKey: queryKeys.agentCatalog }),
    ]);
  };

  return {
    create: useMutation({
      mutationFn: (input: CreateMcpServerInput) => createMcpServer(input),
      onSuccess: invalidateMcpServers,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateMcpServerInput }) =>
        updateMcpServer(id, input),
      onSuccess: invalidateMcpServers,
    }),
    setEnabled: useMutation({
      mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
        setMcpServerEnabled(id, enabled),
      onSuccess: invalidateMcpServers,
    }),
    remove: useMutation({
      mutationFn: ({ id }: { id: string }) => deleteMcpServer(id),
      onSuccess: invalidateMcpServers,
    }),
  };
}
