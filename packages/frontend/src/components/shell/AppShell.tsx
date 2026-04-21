import { useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useTheme } from "@/context/use-theme";
import {
  agentsSidebarRoute,
  dashboardSidebarRoute,
  getRouteTitle,
  isRouteActive,
  secondarySidebarRoutes,
} from "@/app/routes";

export function AppShell() {
  const location = useLocation();
  const title = useMemo(() => getRouteTitle(location.pathname), [location.pathname]);
  const { theme, themes, setTheme } = useTheme();

  return (
    <div className="min-h-screen bg-app-bg text-text-primary">
      <div className="grid min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-sidebar px-4 py-5 lg:flex lg:flex-col lg:gap-6">
          <SidebarContent pathname={location.pathname} />
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-border bg-app-bg/90 backdrop-blur">
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
              <div>
                <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="hidden rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary transition hover:border-accent/50 hover:text-text-primary sm:inline-flex"
                  onClick={() => {
                    const idx = themes.indexOf(theme ?? themes[0] ?? "dark");
                    const next = themes[(idx + 1) % themes.length];
                    if (next) setTheme(next);
                  }}
                  type="button"
                  title="Click to cycle theme"
                >
                  Theme: {theme}
                </button>
                <NavLink className="cc-button cc-button-secondary" to="/profile">
                  Profile
                </NavLink>
              </div>
            </div>
          </header>

          <main className="px-1.5 py-1.5 sm:px-3 lg:px-3 lg:py-2">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarContent(props: { pathname: string }) {
  return (
    <>
      <NavLink className="cc-eyebrow inline-flex w-fit" to="/">
        CommandsCenter
      </NavLink>

      <nav className="grid gap-2" data-testid="sidebar-navigation">
        {dashboardSidebarRoute ? (
          <NavLink
            className={
              isRouteActive(
                props.pathname,
                dashboardSidebarRoute.path,
                dashboardSidebarRoute.navigationMatch,
              )
                ? "cc-nav-item cc-nav-item-active"
                : "cc-nav-item"
            }
            to={dashboardSidebarRoute.path}
          >
            {dashboardSidebarRoute.navLabel}
          </NavLink>
        ) : null}
      </nav>

      <section
        className={
          isRouteActive(
            props.pathname,
            agentsSidebarRoute?.path ?? "/agents",
            agentsSidebarRoute?.navigationMatch,
          )
            ? "rounded-xl border border-accent/30 bg-surface p-4"
            : "rounded-xl border border-border bg-surface p-4"
        }
        data-testid="recent-agents-empty-state"
      >
        <div className="flex items-center justify-between gap-3">
          <NavLink
            className="text-sm font-semibold text-text-primary transition hover:text-accent"
            to="/agents"
          >
            Agents
          </NavLink>
          <NavLink className="text-sm text-accent transition hover:text-accent-hover" to="/agents">
            See all
          </NavLink>
        </div>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Recent agent chats will appear here after the direct chat flow starts recording activity.
        </p>
      </section>

      <nav className="grid gap-2">
        {secondarySidebarRoutes.map((route) => (
          <NavLink
            className={
              isRouteActive(props.pathname, route.path, route.navigationMatch)
                ? "cc-nav-item cc-nav-item-active"
                : "cc-nav-item"
            }
            key={route.path}
            to={route.path}
          >
            {route.navLabel}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
