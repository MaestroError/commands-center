import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { NavLink } from "react-router-dom";

import { useActivitiesQuery, useArchiveActivityMutation } from "@/hooks/use-activities-query";

import { ActivityCard } from "./ActivityCard";

export function ActivityBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const query = useActivitiesQuery();
  const archiveMutation = useArchiveActivityMutation();

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
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label={count > 0 ? `Activity (${String(count)} need attention)` : "Activity"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="h-4 w-4" />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Activity"
          className="absolute right-0 z-40 mt-2 w-96 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-md border border-border bg-surface shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-text-primary">Needs attention</span>
            <NavLink
              to="/"
              className="text-xs text-accent hover:underline"
              onClick={() => setOpen(false)}
            >
              View all
            </NavLink>
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
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
                    compact
                    archiving={
                      archiveMutation.isPending && archiveMutation.variables === activity.id
                    }
                    onArchive={(id) => archiveMutation.mutate(id)}
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
