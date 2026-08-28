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
      const resolvedCollision = previousResolved?.activities.find((activity) => activity.id === id);
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
          activities: sortActivities(
            upsertActivity(previousResolved.activities, toActivityStatus(removed, "archived")),
          ),
        });
      }
      return { removed, resolvedCollision };
    },
    onError: (_error, _id, context) => {
      if (!context?.removed) {
        return;
      }
      const removed = context.removed;
      queryClient.setQueryData<ActivityListResponse>(queryKeys.activities, (current) => {
        if (!current) return current;
        const alreadyPending = current.activities.some(({ id }) => id === removed.id);
        return {
          activities: sortActivities(upsertActivity(current.activities, removed)),
          actionRequiredCount:
            current.actionRequiredCount +
            (!alreadyPending && removed.level === "action_required" ? 1 : 0),
        };
      });
      queryClient.setQueryData<ActivityListResponse>(queryKeys.activitiesResolved, (current) => {
        if (!current) return current;
        return {
          ...current,
          activities: context.resolvedCollision
            ? sortActivities(upsertActivity(current.activities, context.resolvedCollision))
            : current.activities.filter(({ id }) => id !== removed.id),
        };
      });
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
      const pendingCollision = previousPending?.activities.find((activity) => activity.id === id);
      if (previousResolved && removed) {
        queryClient.setQueryData<ActivityListResponse>(queryKeys.activitiesResolved, {
          ...previousResolved,
          activities: previousResolved.activities.filter((activity) => activity.id !== id),
        });
      }
      if (previousPending && removed) {
        const alreadyPending = previousPending.activities.some(
          (activity) => activity.id === removed.id,
        );
        queryClient.setQueryData<ActivityListResponse>(queryKeys.activities, {
          activities: sortActivities(
            upsertActivity(previousPending.activities, toActivityStatus(removed, "pending")),
          ),
          actionRequiredCount:
            previousPending.actionRequiredCount +
            (!alreadyPending && removed.level === "action_required" ? 1 : 0),
        });
      }
      return { pendingCollision, removed };
    },
    onError: (_error, _id, context) => {
      if (!context?.removed) {
        return;
      }
      const removed = context.removed;
      queryClient.setQueryData<ActivityListResponse>(queryKeys.activities, (current) => {
        if (!current) return current;
        const optimisticallyPending = current.activities.some(({ id }) => id === removed.id);
        return {
          activities: context.pendingCollision
            ? sortActivities(upsertActivity(current.activities, context.pendingCollision))
            : current.activities.filter(({ id }) => id !== removed.id),
          actionRequiredCount:
            current.actionRequiredCount -
            (optimisticallyPending &&
            !context.pendingCollision &&
            removed.level === "action_required"
              ? 1
              : 0),
        };
      });
      queryClient.setQueryData<ActivityListResponse>(queryKeys.activitiesResolved, (current) =>
        current
          ? {
              ...current,
              activities: sortActivities(upsertActivity(current.activities, removed)),
            }
          : current,
      );
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
          activities: sortActivities(
            previousPending.activities.reduce(
              (activities, activity) =>
                upsertActivity(activities, toActivityStatus(activity, "archived")),
              previousResolved.activities,
            ),
          ),
        });
      }
      const resolvedCollisions = new Map(
        previousResolved?.activities
          .filter((activity) => previousPending?.activities.some(({ id }) => id === activity.id))
          .map((activity) => [activity.id, activity]),
      );
      return { moved: previousPending?.activities ?? [], resolvedCollisions };
    },
    onError: (_error, _variables, context) => {
      if (!context || context.moved.length === 0) {
        return;
      }
      queryClient.setQueryData<ActivityListResponse>(queryKeys.activities, (current) => {
        if (!current) return current;
        const missing = context.moved.filter(
          (activity) => !current.activities.some(({ id }) => id === activity.id),
        );
        return {
          activities: sortActivities(
            context.moved.reduce(
              (activities, activity) => upsertActivity(activities, activity),
              current.activities,
            ),
          ),
          actionRequiredCount:
            current.actionRequiredCount +
            missing.filter(({ level }) => level === "action_required").length,
        };
      });
      queryClient.setQueryData<ActivityListResponse>(queryKeys.activitiesResolved, (current) => {
        if (!current) return current;
        return {
          ...current,
          activities: sortActivities(
            context.moved.reduce((activities, activity) => {
              const collision = context.resolvedCollisions.get(activity.id);
              return collision
                ? upsertActivity(activities, collision)
                : activities.filter(({ id }) => id !== activity.id);
            }, current.activities),
          ),
        };
      });
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

function upsertActivity(activities: Activity[], activity: Activity): Activity[] {
  return [...activities.filter((entry) => entry.id !== activity.id), activity];
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
