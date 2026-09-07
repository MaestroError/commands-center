import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { NavLink } from "react-router";

import {
  useActivitiesQuery,
  useActivityReadStateChanging,
  useActivityReadStateError,
  useArchiveActivityMutation,
} from "@/hooks/use-activities-query";

import { ActivityCard } from "./ActivityCard";
import { ArchiveAllActivitiesButton } from "./ArchiveAllActivitiesButton";

export function ActivityBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const query = useActivitiesQuery();
  const archiveMutation = useArchiveActivityMutation();
  const readStateChanging = useActivityReadStateChanging();
  const readStateError = useActivityReadStateError();

  const count = query.data?.actionRequiredCount ?? 0;
  const actionable = (query.data?.activities ?? []).filter(
    (activity) => activity.level === "action_required",
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" data-activity-surface ref={containerRef}>
      <button
        type="button"
        aria-label={count > 0 ? `Activity (${String(count)} need attention)` : "Activity"}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
        data-activity-focus-fallback
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
      >
        <Bell className="h-4 w-4" />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        // Simple popover (not a focus-trapping dialog).
        <div
          aria-label="Activity"
          className="fixed inset-x-3 top-20 z-40 max-h-[calc(100vh-6rem)] overflow-hidden rounded-md border border-border bg-surface shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 sm:max-w-[calc(100vw-1.5rem)]"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-text-primary">Needs attention</span>
            <div className="flex items-center gap-3">
              <ArchiveAllActivitiesButton
                count={query.data?.activities.length ?? 0}
                compact
                successFocusRef={triggerRef}
              />
              <NavLink
                to="/"
                className="text-xs text-accent hover:underline"
                onClick={() => setOpen(false)}
              >
                View all
              </NavLink>
            </div>
          </div>
          {readStateError ? (
            <p
              className="border-b border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
              role="alert"
            >
              Could not update the notification. Its previous state has been restored.
            </p>
          ) : null}
          <div className="max-h-[calc(100vh-10rem)] overflow-y-auto p-2 sm:max-h-96">
            {actionable.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-text-secondary">
                Nothing needs your attention.
              </p>
            ) : (
              <div className="grid gap-2">
                {actionable.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    mode="compact"
                    archiving={readStateChanging}
                    onMarkRead={(id) => archiveMutation.mutate(id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
