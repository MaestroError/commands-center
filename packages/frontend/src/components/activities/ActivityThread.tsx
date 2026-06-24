import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { useActivitiesQuery, useArchiveActivityMutation } from "@/hooks/use-activities-query";

import { ActivityCard } from "./ActivityCard";

export function ActivityThread() {
  const query = useActivitiesQuery();
  const archiveMutation = useArchiveActivityMutation();

  if (query.isLoading) {
    return <LoadingState />;
  }

  if (query.error) {
    return (
      <ErrorState
        title="Could not load activity"
        description="Something went wrong while loading your activity. Try again."
      />
    );
  }

  const activities = query.data?.activities ?? [];
  if (activities.length === 0) {
    return (
      <EmptyState
        title="You're all caught up"
        description="Actions and updates that need your attention will show up here."
      />
    );
  }

  return (
    <div className="grid gap-2">
      {activities.map((activity) => (
        <ActivityCard
          key={activity.id}
          activity={activity}
          archiving={archiveMutation.isPending && archiveMutation.variables === activity.id}
          onArchive={(id) => archiveMutation.mutate(id)}
        />
      ))}
    </div>
  );
}
