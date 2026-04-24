import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getEngineStatus } from "@/lib/api";
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
