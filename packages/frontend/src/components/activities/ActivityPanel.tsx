import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { Bell, X } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/PageStates";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  useActivityReadStateChanging,
  useActivityReadStateError,
  useActivitiesQuery,
  useArchiveActivityMutation,
  useResolvedActivitiesQuery,
  useUnarchiveActivityMutation,
} from "@/hooks/use-activities-query";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";

import { ActivityFeed } from "./ActivityFeed";
import { ArchiveAllActivitiesButton } from "./ArchiveAllActivitiesButton";
import { formatRelativeActivityTime } from "./activity-format";

type ActivityFilter = "all" | "attention" | "resolved";

const EMPTY_STATES: Record<ActivityFilter, { title: string; description: string }> = {
  all: {
    title: "Nothing to catch up on",
    description: "New failures, completed runs, and review requests will appear here.",
  },
  attention: {
    title: "Nothing needs your attention",
    description: "Action-required activity will appear here when a specialist needs you.",
  },
  resolved: {
    title: "No resolved notifications yet",
    description: "Notifications you mark read move here so you can find them again.",
  },
};

export function ActivityPanel() {
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>("all");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileIndex, setMobileIndex] = useState(0);
  const desktopAllFilterRef = useRef<HTMLButtonElement>(null);
  const mobileAllFilterRef = useRef<HTMLButtonElement>(null);
  const desktop = useMediaQuery("(min-width: 768px)");
  const pendingQuery = useActivitiesQuery();
  const resolvedQuery = useResolvedActivitiesQuery();
  const archiveMutation = useArchiveActivityMutation();
  const unarchiveMutation = useUnarchiveActivityMutation();
  const readStateChanging = useActivityReadStateChanging();
  const readStateError = useActivityReadStateError();
  const pending = useMemo(
    () => pendingQuery.data?.activities ?? [],
    [pendingQuery.data?.activities],
  );
  const attention = useMemo(
    () => pending.filter((activity) => activity.level === "action_required"),
    [pending],
  );
  const resolved = useMemo(
    () => [...(resolvedQuery.data?.activities ?? [])].reverse(),
    [resolvedQuery.data?.activities],
  );
  const visible =
    activeFilter === "all" ? pending : activeFilter === "attention" ? attention : resolved;
  const loading = activeFilter === "resolved" ? resolvedQuery.isLoading : pendingQuery.isLoading;
  const error = activeFilter === "resolved" ? resolvedQuery.error : pendingQuery.error;
  const latest = pending.at(-1);
  const emptyState = EMPTY_STATES[activeFilter];
  useEffect(() => {
    if (desktop) {
      setMobileOpen(false);
    }
  }, [desktop]);

  function changeFilter(filter: ActivityFilter): void {
    setActiveFilter(filter);
    setMobileIndex(0);
  }

  const feed = loading ? (
    <LoadingState />
  ) : error ? (
    <ErrorState
      title="Could not load activity"
      description="Something went wrong while loading your activity. Try again."
    />
  ) : (
    <ActivityFeed
      activities={visible}
      archivingId={archiveMutation.isPending ? archiveMutation.variables : undefined}
      emptyDescription={emptyState.description}
      emptyTitle={emptyState.title}
      mode={activeFilter === "resolved" ? "resolved" : "pending"}
      onMarkRead={(id) => archiveMutation.mutate(id)}
      onMarkUnread={(id) => unarchiveMutation.mutate(id)}
      readStateChanging={readStateChanging}
      unarchivingId={unarchiveMutation.isPending ? unarchiveMutation.variables : undefined}
    />
  );

  return (
    <>
      <section className="cc-panel hidden min-w-0 p-5 md:block sm:p-6" data-testid="activity-panel">
        <div className="flex flex-wrap items-center gap-3">
          <ActivityFilterBar
            activeFilter={activeFilter}
            attentionCount={attention.length}
            allFilterRef={desktopAllFilterRef}
            onChange={changeFilter}
            pendingCount={pending.length}
            resolvedCount={resolved.length}
          />
          <div className="flex-1" />
          {activeFilter !== "resolved" ? (
            <ArchiveAllActivitiesButton
              count={pending.length}
              successFocusRef={desktopAllFilterRef}
            />
          ) : null}
        </div>
        <div className="my-5 h-px bg-border" />
        {readStateError ? (
          <p
            className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            role="alert"
          >
            Could not update the notification. Its previous state has been restored.
          </p>
        ) : null}
        {feed}
      </section>

      <button
        className="cc-panel flex w-full items-center gap-3 border-l-[3px] border-l-accent p-4 text-left md:hidden"
        onClick={() => {
          setMobileIndex(0);
          setMobileOpen(true);
        }}
        type="button"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Bell aria-hidden="true" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text-primary">Notifications</span>
          <span className="mt-0.5 block truncate text-xs text-text-secondary">
            {latest
              ? `${String(pending.length)} unread · latest ${formatRelativeActivityTime(latest.createdAt)}`
              : "You are all caught up"}
          </span>
        </span>
        <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-accent px-2 py-1 text-xs font-semibold text-on-accent">
          {pending.length}
        </span>
      </button>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="inset-0 left-0 top-0 h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 md:hidden">
          <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-3 py-3">
            <DialogClose asChild>
              <button
                aria-label="Close notifications"
                className={cn(buttonVariants({ variant: "secondary", size: "icon" }), "shrink-0")}
                type="button"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </DialogClose>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base">
                {activeFilter === "all"
                  ? "All"
                  : activeFilter === "attention"
                    ? "Needs attention"
                    : "Resolved"}
              </DialogTitle>
              <DialogDescription className="mt-0 text-xs">
                {visible.length === 0
                  ? "0 of 0"
                  : `${String(Math.min(mobileIndex + 1, visible.length))} of ${String(visible.length)}`}
              </DialogDescription>
            </div>
            {activeFilter !== "resolved" ? (
              <ArchiveAllActivitiesButton
                compact
                count={pending.length}
                successFocusRef={mobileAllFilterRef}
              />
            ) : null}
          </div>
          <div className="shrink-0 overflow-x-auto border-b border-border bg-surface px-3 py-2">
            <ActivityFilterBar
              activeFilter={activeFilter}
              attentionCount={attention.length}
              allFilterRef={mobileAllFilterRef}
              compact
              onChange={changeFilter}
              pendingCount={pending.length}
              resolvedCount={resolved.length}
              testIdPrefix="activity-mobile-tab"
            />
          </div>
          {readStateError ? (
            <p
              className="shrink-0 border-b border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger"
              role="alert"
            >
              Could not update the notification. Its previous state has been restored.
            </p>
          ) : null}
          <div className="min-h-0 flex-1 bg-app-bg">
            {loading ? (
              <div className="p-4">
                <LoadingState />
              </div>
            ) : error ? (
              <div className="p-4">
                <ErrorState
                  title="Could not load activity"
                  description="Something went wrong while loading your activity. Try again."
                />
              </div>
            ) : (
              <ActivityFeed
                activities={visible}
                archivingId={archiveMutation.isPending ? archiveMutation.variables : undefined}
                emptyDescription={emptyState.description}
                emptyTitle={emptyState.title}
                key={activeFilter}
                mobile
                mode={activeFilter === "resolved" ? "resolved" : "pending"}
                onMarkRead={(id) => archiveMutation.mutate(id)}
                onMarkUnread={(id) => unarchiveMutation.mutate(id)}
                onMobileIndexChange={setMobileIndex}
                readStateChanging={readStateChanging}
                unarchivingId={
                  unarchiveMutation.isPending ? unarchiveMutation.variables : undefined
                }
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ActivityFilterBar({
  activeFilter,
  pendingCount,
  attentionCount,
  resolvedCount,
  onChange,
  compact = false,
  testIdPrefix = "activity-tab",
  allFilterRef,
}: {
  activeFilter: ActivityFilter;
  pendingCount: number;
  attentionCount: number;
  resolvedCount: number;
  onChange: (filter: ActivityFilter) => void;
  compact?: boolean;
  testIdPrefix?: string;
  allFilterRef?: Ref<HTMLButtonElement>;
}) {
  const filters: Array<{ id: ActivityFilter; label: string; count: number }> = [
    { id: "all", label: "All", count: pendingCount },
    { id: "attention", label: "Needs attention", count: attentionCount },
    { id: "resolved", label: "Resolved", count: resolvedCount },
  ];

  return (
    <div aria-label="Activity filters" className="flex min-w-0 gap-2" role="group">
      {filters.map((filter) => (
        <button
          aria-pressed={activeFilter === filter.id}
          className={cn(
            "relative shrink-0 whitespace-nowrap rounded-full border border-border text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring",
            activeFilter === filter.id && "border-accent bg-accent text-on-accent",
            compact ? "min-h-11 px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
          )}
          data-testid={`${testIdPrefix}-${filter.id}`}
          key={filter.id}
          ref={filter.id === "all" ? allFilterRef : undefined}
          onClick={() => onChange(filter.id)}
          type="button"
        >
          {filter.label}
          <span className="ml-2 tabular-nums opacity-80">{filter.count}</span>
        </button>
      ))}
    </div>
  );
}
