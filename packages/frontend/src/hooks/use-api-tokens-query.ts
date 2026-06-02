import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiTokenScope } from "@cc/shared/schemas";

import { createApiToken, listApiTokens, revokeApiToken } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useApiTokensQuery() {
  return useQuery({
    queryKey: queryKeys.apiTokens,
    queryFn: listApiTokens,
  });
}

export function useApiTokenMutations() {
  const queryClient = useQueryClient();

  return {
    create: useMutation({
      mutationFn: (input: { name: string; scopes: ApiTokenScope[] }) => createApiToken(input),
      onSuccess() {
        void queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens });
      },
    }),
    revoke: useMutation({
      mutationFn: (id: string) => revokeApiToken(id),
      onSuccess() {
        void queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens });
      },
    }),
  };
}
