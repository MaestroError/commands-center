import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiTokenPermissions } from "@cc/shared/schemas";

import { createApiToken, listApiTokens, revokeApiToken, updateApiToken } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useApiTokensQuery() {
  return useQuery({
    queryKey: queryKeys.apiTokens,
    queryFn: listApiTokens,
  });
}

export function useApiTokenMutations() {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens });
  }

  return {
    create: useMutation({
      mutationFn: (input: { name: string; permissions: ApiTokenPermissions }) =>
        createApiToken(input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input: { id: string; name?: string; permissions: ApiTokenPermissions }) =>
        updateApiToken(input.id, { name: input.name, permissions: input.permissions }),
      onSuccess: invalidate,
    }),
    revoke: useMutation({
      mutationFn: (id: string) => revokeApiToken(id),
      onSuccess: invalidate,
    }),
  };
}
