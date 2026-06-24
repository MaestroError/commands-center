import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { useResolvedActivitiesQuery } from "@/hooks/use-activities-query";

import { ActivityCard } from "./ActivityCard";

export function ResolvedActivityList() {
  const query = useResolvedActivitiesQuery();

  if (query.isLoading) {
    return <LoadingState />;
  }

  if (query.error) {
    return (
      <ErrorState
        title="Could not load history"
        description="Something went wrong while loading resolved activity. Try again."
      />
    );
  }

  // Newest first — this is a read-only history log.
  const activities = [...(query.data?.activities ?? [])].reverse();
  if (activities.length === 0) {
    return (
      <EmptyState
        title="No resolved activity yet"
        description="Activities you have handled will appear here."
      />
    );
  }

  return (
    <div className="grid gap-2">
      {activities.map((activity) => (
        <ActivityCard key={activity.id} activity={activity} readOnly />
      ))}
    </div>
  );
}
