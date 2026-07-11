import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { archiveActivity, archiveAllActivities, fillSecret, getActivities } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import type { ActivityListResponse } from "@cc/shared/schemas";

const POLL_INTERVAL_MS = 20_000;

export function useActivitiesQuery() {
  return useQuery({
    queryKey: queryKeys.activities,
    queryFn: () => getActivities(),
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
}

export function useResolvedActivitiesQuery() {
  return useQuery({
    queryKey: queryKeys.activitiesResolved,
    queryFn: () => getActivities("archived"),
    refetchOnWindowFocus: true,
  });
}

export function useArchiveActivityMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveActivity(id),
    // Optimistically drop the card and decrement the action-required count.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.activities });
      const previous = queryClient.getQueryData<ActivityListResponse>(queryKeys.activities);
      if (previous) {
        const removed = previous.activities.find((activity) => activity.id === id);
        queryClient.setQueryData<ActivityListResponse>(queryKeys.activities, {
          activities: previous.activities.filter((activity) => activity.id !== id),
          actionRequiredCount:
            removed?.level === "action_required"
              ? Math.max(0, previous.actionRequiredCount - 1)
              : previous.actionRequiredCount,
        });
      }
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.activities, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activitiesResolved });
    },
  });
}

export function useArchiveAllActivitiesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: archiveAllActivities,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activitiesResolved });
    },
  });
}

export function useFillSecretMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => fillSecret(id, value),
    // The endpoint sets the secret and archives the card; refresh both surfaces.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activitiesResolved });
      void queryClient.invalidateQueries({ queryKey: queryKeys.secrets });
    },
  });
}
