import { useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useTheme } from "@/context/use-theme";
import { sidebarRoutes, getRouteTitle, isRouteActive } from "@/app/routes";
import { useUiStore, type UiState } from "@/stores/ui-store";

export function AppShell() {
  const location = useLocation();
  const title = useMemo(() => getRouteTitle(location.pathname), [location.pathname]);
  const mobileSidebarOpen = useUiStore((state: UiState) => state.mobileSidebarOpen);
  const setMobileSidebarOpen = useUiStore((state: UiState) => state.setMobileSidebarOpen);
  const { theme } = useTheme();

  return (
    <div className="min-h-screen bg-app-bg text-text-primary">
      <div className="grid min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-sidebar px-4 py-5 lg:flex lg:flex-col lg:gap-6">
          <SidebarContent pathname={location.pathname} />
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-border bg-app-bg/90 backdrop-blur">
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3">
                <button
                  className="cc-button cc-button-secondary lg:hidden"
                  onClick={() => setMobileSidebarOpen(true)}
                  type="button"
                >
                  Menu
                </button>
                <div>
                  <p className="cc-eyebrow">CommandsCenter</p>
                  <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary sm:inline-flex">
                  Theme: {theme}
                </span>
                <NavLink className="cc-button cc-button-secondary" to="/profile">
                  Profile
                </NavLink>
              </div>
            </div>
          </header>

          <main className="px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
            <Outlet />
          </main>
        </div>
      </div>

      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 bg-app-bg/85 backdrop-blur-sm lg:hidden">
          <aside className="absolute inset-y-0 left-0 w-80 max-w-[85vw] border-r border-border bg-sidebar px-4 py-5">
            <div className="mb-4 flex justify-end">
              <button
                className="cc-button cc-button-secondary"
                onClick={() => setMobileSidebarOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <SidebarContent
              onNavigate={() => setMobileSidebarOpen(false)}
              pathname={location.pathname}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function SidebarContent(props: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      <div className="rounded-3xl border border-border bg-surface p-4">
        <p className="cc-eyebrow">CommandsCenter</p>
        <h2 className="mt-2 text-2xl font-semibold text-text-primary">Frontend foundation</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Shared shell, panel workspace, semantic themes, and reusable state primitives for the rest
          of the product.
        </p>
      </div>

      <nav className="grid gap-2" data-testid="sidebar-navigation">
        {sidebarRoutes.map((route) => (
          <NavLink
            className={
              isRouteActive(props.pathname, route.path, route.navigationMatch)
                ? "cc-nav-item cc-nav-item-active"
                : "cc-nav-item"
            }
            key={route.path}
            onClick={props.onNavigate}
            to={route.path}
          >
            {route.navLabel}
          </NavLink>
        ))}
      </nav>

      <section
        className="rounded-3xl border border-border bg-surface p-4"
        data-testid="recent-agents-empty-state"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-text-primary">Agents</h3>
          <NavLink
            className="text-sm text-accent transition hover:text-accent-hover"
            onClick={props.onNavigate}
            to="/agents"
          >
            See all
          </NavLink>
        </div>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Recent agent chats will appear here after the direct chat flow starts recording activity.
        </p>
      </section>
    </>
  );
}
