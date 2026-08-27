import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  archiveActivity,
  archiveAllActivities,
  fillSecret,
  getActivities,
  unarchiveActivity,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import type { Activity, ActivityListResponse } from "@cc/shared/schemas";

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
    onMutate: async (id) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.activities }),
        queryClient.cancelQueries({ queryKey: queryKeys.activitiesResolved }),
      ]);
      const previousPending = queryClient.getQueryData<ActivityListResponse>(queryKeys.activities);
      const previousResolved = queryClient.getQueryData<ActivityListResponse>(
        queryKeys.activitiesResolved,
      );
      const removed = previousPending?.activities.find((activity) => activity.id === id);
      if (previousPending && removed) {
        queryClient.setQueryData<ActivityListResponse>(queryKeys.activities, {
          activities: previousPending.activities.filter((activity) => activity.id !== id),
          actionRequiredCount:
            removed.level === "action_required"
              ? Math.max(0, previousPending.actionRequiredCount - 1)
              : previousPending.actionRequiredCount,
        });
      }
      if (previousResolved && removed) {
        queryClient.setQueryData<ActivityListResponse>(queryKeys.activitiesResolved, {
          ...previousResolved,
          activities: sortActivities([
            ...previousResolved.activities,
            toActivityStatus(removed, "archived"),
          ]),
        });
      }
      return { previousPending, previousResolved };
    },
    onError: (_error, _id, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(queryKeys.activities, context.previousPending);
      }
      if (context?.previousResolved) {
        queryClient.setQueryData(queryKeys.activitiesResolved, context.previousResolved);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activitiesResolved });
    },
  });
}

export function useUnarchiveActivityMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unarchiveActivity(id),
    onMutate: async (id) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.activities }),
        queryClient.cancelQueries({ queryKey: queryKeys.activitiesResolved }),
      ]);
      const previousPending = queryClient.getQueryData<ActivityListResponse>(queryKeys.activities);
      const previousResolved = queryClient.getQueryData<ActivityListResponse>(
        queryKeys.activitiesResolved,
      );
      const removed = previousResolved?.activities.find((activity) => activity.id === id);
      if (previousResolved && removed) {
        queryClient.setQueryData<ActivityListResponse>(queryKeys.activitiesResolved, {
          ...previousResolved,
          activities: previousResolved.activities.filter((activity) => activity.id !== id),
        });
      }
      if (previousPending && removed) {
        queryClient.setQueryData<ActivityListResponse>(queryKeys.activities, {
          activities: sortActivities([
            ...previousPending.activities,
            toActivityStatus(removed, "pending"),
          ]),
          actionRequiredCount:
            previousPending.actionRequiredCount + (removed.level === "action_required" ? 1 : 0),
        });
      }
      return { previousPending, previousResolved };
    },
    onError: (_error, _id, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(queryKeys.activities, context.previousPending);
      }
      if (context?.previousResolved) {
        queryClient.setQueryData(queryKeys.activitiesResolved, context.previousResolved);
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
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.activities }),
        queryClient.cancelQueries({ queryKey: queryKeys.activitiesResolved }),
      ]);
      const previousPending = queryClient.getQueryData<ActivityListResponse>(queryKeys.activities);
      const previousResolved = queryClient.getQueryData<ActivityListResponse>(
        queryKeys.activitiesResolved,
      );
      if (previousPending) {
        queryClient.setQueryData<ActivityListResponse>(queryKeys.activities, {
          activities: [],
          actionRequiredCount: 0,
        });
      }
      if (previousPending && previousResolved) {
        queryClient.setQueryData<ActivityListResponse>(queryKeys.activitiesResolved, {
          ...previousResolved,
          activities: sortActivities([
            ...previousResolved.activities,
            ...previousPending.activities.map((activity) => toActivityStatus(activity, "archived")),
          ]),
        });
      }
      return { previousPending, previousResolved };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(queryKeys.activities, context.previousPending);
      }
      if (context?.previousResolved) {
        queryClient.setQueryData(queryKeys.activitiesResolved, context.previousResolved);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activitiesResolved });
    },
  });
}

function toActivityStatus(activity: Activity, status: Activity["status"]): Activity {
  const now = new Date().toISOString();
  return {
    ...activity,
    status,
    updatedAt: now,
    archivedAt: status === "archived" ? now : null,
  };
}

function sortActivities(activities: Activity[]): Activity[] {
  return [...activities].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
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
