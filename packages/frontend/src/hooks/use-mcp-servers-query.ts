import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  authenticateMcp,
  completeMcpAuth,
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  removeMcpAuth,
  setMcpServerEnabled,
  startMcpAuth,
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
    startAuth: useMutation({
      mutationFn: ({ id }: { id: string }) => startMcpAuth(id),
    }),
    authenticate: useMutation({
      mutationFn: ({ id }: { id: string }) => authenticateMcp(id),
      onSuccess: invalidateMcpServers,
    }),
    completeAuth: useMutation({
      mutationFn: ({ id, code }: { id: string; code: string }) => completeMcpAuth(id, code),
      onSuccess: invalidateMcpServers,
    }),
    removeAuth: useMutation({
      mutationFn: ({ id }: { id: string }) => removeMcpAuth(id),
      onSuccess: invalidateMcpServers,
    }),
  };
}
