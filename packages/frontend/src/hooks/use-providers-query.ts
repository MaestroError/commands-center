import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  completeProviderOauth,
  disconnectProvider,
  listProviders,
  startProviderOauth,
  submitProviderApiKey,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useProvidersQuery() {
  return useQuery({
    queryKey: queryKeys.providers,
    queryFn: () => listProviders(),
  });
}

export function useProviderMutations() {
  const queryClient = useQueryClient();

  const invalidateProviders = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.providers });
  };

  return {
    connectApiKey: useMutation({
      mutationFn: ({ providerId, apiKey }: { providerId: string; apiKey: string }) =>
        submitProviderApiKey(providerId, apiKey),
      onSuccess: invalidateProviders,
    }),
    startOauth: useMutation({
      mutationFn: ({
        providerId,
        method,
        inputs,
      }: {
        providerId: string;
        method: number;
        inputs?: Record<string, string>;
      }) => startProviderOauth(providerId, method, inputs),
    }),
    completeOauth: useMutation({
      mutationFn: ({
        providerId,
        method,
        code,
      }: {
        providerId: string;
        method: number;
        code?: string;
      }) => completeProviderOauth(providerId, method, code),
      onSuccess: async (result) => {
        if (result.connected) {
          await invalidateProviders();
        }
      },
    }),
    disconnect: useMutation({
      mutationFn: ({ providerId }: { providerId: string }) => disconnectProvider(providerId),
      onSuccess: invalidateProviders,
    }),
  };
}
