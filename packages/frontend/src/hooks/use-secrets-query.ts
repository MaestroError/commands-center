import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deleteSecret, listSecrets, setSecret } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useSecretsQuery() {
  return useQuery({
    queryKey: queryKeys.secrets,
    queryFn: () => listSecrets(),
  });
}

export function useSecretMutations() {
  const queryClient = useQueryClient();

  const invalidateSecrets = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.secrets }),
      queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers }),
    ]);
  };

  return {
    set: useMutation({
      mutationFn: ({ key, value, restart }: { key: string; value: string; restart?: boolean }) =>
        setSecret(key, value, restart),
      onSuccess: invalidateSecrets,
    }),
    remove: useMutation({
      mutationFn: ({ key, restart }: { key: string; restart?: boolean }) =>
        deleteSecret(key, restart),
      onSuccess: invalidateSecrets,
    }),
  };
}
