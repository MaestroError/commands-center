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
      mutationFn: ({ key, value }: { key: string; value: string }) => setSecret(key, value),
      onSuccess: invalidateSecrets,
    }),
    remove: useMutation({
      mutationFn: ({ key }: { key: string }) => deleteSecret(key),
      onSuccess: invalidateSecrets,
    }),
  };
}
