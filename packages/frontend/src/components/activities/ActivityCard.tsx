import type { Activity } from "@cc/shared/schemas";

import { Markdown } from "@/components/chat/Markdown";

import { ActivityActions } from "./ActivityActions";
import { getActivityKindMeta } from "./activity-registry";

type ActivityCardProps = {
  activity: Activity;
  onArchive?: (id: string) => void;
  archiving?: boolean;
  compact?: boolean;
  /** Read-only history card (Resolved tab): no action buttons. */
  readOnly?: boolean;
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function ActivityCard({
  activity,
  onArchive,
  archiving,
  compact,
  readOnly,
}: ActivityCardProps) {
  const meta = getActivityKindMeta(activity.kind);
  const Icon = meta.icon;
  const actionRequired = activity.level === "action_required";

  return (
    <div
      className={`min-w-0 rounded-md border bg-surface p-3 ${
        actionRequired && !readOnly ? "border-accent/40" : "border-border"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
            actionRequired && !readOnly
              ? "bg-accent/10 text-accent"
              : "bg-border/40 text-text-secondary"
          }`}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 break-words text-sm font-medium text-text-primary">
              {activity.title}
            </p>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-text-secondary">
              {relativeTime(activity.createdAt)}
            </span>
          </div>
          {activity.body && !compact ? (
            <div className="mt-1.5 max-h-48 overflow-auto break-words text-xs text-text-secondary">
              <Markdown content={activity.body} />
            </div>
          ) : null}
          {!readOnly && onArchive ? (
            <div className="mt-2">
              <ActivityActions activity={activity} onArchive={onArchive} archiving={archiving} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
