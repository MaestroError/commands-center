import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  checkSystemVersion,
  getSystemUpdatePreferences,
  getSystemVersion,
  updateSystem,
  updateSystemUpdatePreferences,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useSystemVersionQuery() {
  return useQuery({
    queryKey: queryKeys.systemVersion,
    queryFn: getSystemVersion,
    refetchInterval: 6 * 60 * 60 * 1000,
  });
}

export function useSystemUpdateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSystem,
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.systemVersion });
    },
  });
}

export function useSystemVersionCheckMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: checkSystemVersion,
    onSuccess(version) {
      queryClient.setQueryData(queryKeys.systemVersion, version);
    },
  });
}

export function useSystemUpdatePreferencesQuery() {
  return useQuery({
    queryKey: queryKeys.systemUpdatePreferences,
    queryFn: getSystemUpdatePreferences,
  });
}

export function useSystemUpdatePreferencesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSystemUpdatePreferences,
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.systemUpdatePreferences });
      void queryClient.invalidateQueries({ queryKey: queryKeys.systemVersion });
    },
  });
}
