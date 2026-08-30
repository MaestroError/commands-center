import type { UIEvent } from "react";

import type { Activity } from "@cc/shared/schemas";

import { EmptyState } from "@/components/common/PageStates";
import { cn } from "@/lib/cn";

import { ActivityCard, type ActivityCardMode } from "./ActivityCard";

type ActivityFeedProps = {
  activities: Activity[];
  mode: ActivityCardMode;
  emptyTitle: string;
  emptyDescription: string;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  archivingId?: string;
  unarchivingId?: string;
  readStateChanging?: boolean;
  mobile?: boolean;
  onMobileIndexChange?: (index: number) => void;
};

export function ActivityFeed({
  activities,
  mode,
  emptyTitle,
  emptyDescription,
  onMarkRead,
  onMarkUnread,
  archivingId,
  unarchivingId,
  readStateChanging = false,
  mobile = false,
  onMobileIndexChange,
}: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <div className={cn(mobile && "flex h-full items-center px-4")}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  function onScroll(event: UIEvent<HTMLDivElement>): void {
    if (!onMobileIndexChange) {
      return;
    }
    const element = event.currentTarget;
    const index = Math.round(element.scrollTop / Math.max(element.clientHeight, 1));
    onMobileIndexChange(Math.min(Math.max(index, 0), activities.length - 1));
  }

  return (
    <div
      data-testid={mobile ? "activity-mobile-feed" : undefined}
      className={cn(
        mobile
          ? "h-full min-w-0 max-w-full snap-y snap-mandatory overflow-y-auto [scrollbar-width:thin]"
          : "grid min-w-0 w-full max-w-full grid-cols-[minmax(0,1fr)] gap-4",
      )}
      onScroll={mobile ? onScroll : undefined}
    >
      {activities.map((activity) => {
        const activityReadStateDisabled =
          readStateChanging || archivingId === activity.id || unarchivingId === activity.id;
        return (
          <div
            className={cn(
              "min-w-0 w-full max-w-full",
              mobile && "h-full min-h-full snap-start snap-always p-4",
            )}
            key={activity.id}
          >
            <ActivityCard
              activity={activity}
              archiving={activityReadStateDisabled}
              mobile={mobile}
              mode={mode}
              onMarkRead={onMarkRead}
              onMarkUnread={onMarkUnread}
              unarchiving={unarchivingId === activity.id}
            />
          </div>
        );
      })}
    </div>
  );
}
