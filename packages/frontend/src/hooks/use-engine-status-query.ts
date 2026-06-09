import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getEngineStatus, restartEngine } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useEngineStatusQuery() {
  return useQuery({
    queryKey: queryKeys.engineStatus,
    queryFn: getEngineStatus,
    refetchInterval: 10000,
  });
}

export function useMarkEngineRestarting() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    // Trigger a refetch but keep the previously cached status visible until it
    // resolves, so the engine card does not blank out without a loading state.
    void queryClient.invalidateQueries({ queryKey: queryKeys.engineStatus });
  }, [queryClient]);
}

export function useEngineRestartMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restartEngine,
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.engineStatus, status);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.engineStatus });
    },
  });
}
