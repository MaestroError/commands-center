import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronRight, Settings2 } from "lucide-react";

import { isRouteActive, manageSidebarRoutes } from "@/app/routes";

const MANAGE_LABEL = "Manage";

type ManageSidebarSectionProps = {
  collapsed: boolean;
  pathname: string;
  onNavigate: () => void;
};

export function ManageSidebarSection(props: ManageSidebarSectionProps) {
  const isActive = manageSidebarRoutes.some((route) =>
    isRouteActive(props.pathname, route.path, route.navigationMatch),
  );
  const [open, setOpen] = useState(isActive);

  // Auto-expand on navigating into any "Manage" page, auto-collapse on
  // navigating away to any other page. Only fires on group-active
  // transitions (not every render), so manually toggling the section while
  // staying within the group, or moving between two Manage pages, doesn't
  // get overridden. Mirrors DocumentsSidebarSection.
  useEffect(() => {
    setOpen(isActive);
  }, [isActive]);

  if (props.collapsed) {
    const firstRoute = manageSidebarRoutes[0];
    return (
      <NavLink
        aria-label={MANAGE_LABEL}
        className={[
          "flex h-10 items-center justify-center rounded-lg border transition",
          isActive
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border bg-surface text-text-secondary hover:border-accent/40 hover:text-text-primary",
        ].join(" ")}
        onClick={props.onNavigate}
        title={MANAGE_LABEL}
        to={firstRoute?.path ?? "/files"}
      >
        <Settings2 className="h-4 w-4 shrink-0" />
      </NavLink>
    );
  }

  return (
    <div className="grid min-w-0 gap-0.5" data-testid="manage-sidebar-section">
      <button
        aria-expanded={open}
        aria-label={open ? "Collapse Manage" : "Expand Manage"}
        className={
          isActive
            ? "cc-nav-item-active flex w-full min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-2 text-left text-sm font-medium transition"
            : "flex w-full min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-2 text-left text-sm font-medium text-text-secondary transition hover:bg-surface hover:text-text-primary"
        }
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <Settings2 className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{MANAGE_LABEL}</span>
      </button>

      {open ? (
        <div className="grid min-w-0 gap-0.5 pl-3">
          {manageSidebarRoutes.map((route) => {
            const childActive = isRouteActive(props.pathname, route.path, route.navigationMatch);
            return (
              <NavLink
                aria-label={route.navLabel ?? route.title}
                className={
                  childActive
                    ? "cc-nav-item-active flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition"
                    : "flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition hover:bg-surface hover:text-text-primary"
                }
                key={route.path}
                onClick={props.onNavigate}
                to={route.path}
              >
                {route.navIcon}
                <span className="min-w-0 flex-1 truncate">{route.navLabel}</span>
              </NavLink>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
