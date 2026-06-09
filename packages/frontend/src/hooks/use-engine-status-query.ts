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
    queryClient.setQueryData(queryKeys.engineStatus, undefined);
    void queryClient.invalidateQueries({ queryKey: queryKeys.engineStatus });
  }, [queryClient]);
}

export function useEngineRestartMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restartEngine,
    onMutate: () => {
      queryClient.setQueryData(queryKeys.engineStatus, undefined);
    },
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.engineStatus, status);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.engineStatus });
    },
  });
}
