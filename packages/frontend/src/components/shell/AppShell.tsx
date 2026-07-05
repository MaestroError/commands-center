import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronLeft, Clipboard, Clock3, ListChecks, Menu, Search } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { ActivityBell } from "@/components/activities/ActivityBell";
import { DocumentsSidebarSection } from "@/components/documents/DocumentsSidebarSection";
import { ManageSidebarSection } from "@/components/shell/ManageSidebarSection";
import { SpecialistAvatar } from "@/components/specialists/specialist-avatar";
import { AppLogo } from "@/components/common/AppLogo";
import { GlobalSearchPalette } from "@/components/search/GlobalSearchPalette";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useEngineStatusQuery } from "@/hooks/use-engine-status-query";
import { useSystemVersionQuery } from "@/hooks/use-system-version-query";
import { useActiveTaskRunsQuery } from "@/hooks/use-tasks-query";
import { useTheme } from "@/context/use-theme";
import {
  specialistsSidebarRoute,
  dashboardSidebarRoute,
  getRouteTitle,
  isRouteActive,
  manageSidebarRoutePaths,
  secondarySidebarRoutes,
} from "@/app/routes";
import { readRecentSpecialists } from "@/lib/recent-specialists";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "cc-sidebar-collapsed";
const FIRST_RUN_ENV_NOTICE_STORAGE_KEY = "cc-first-run-env-notice-dismissed";

export function AppShell() {
  const location = useLocation();
  const pathname = location.pathname;
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const title = getRouteTitle(pathname);
  const { theme, themes, setTheme } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readStoredSidebarCollapsed);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchPaletteOpen, setSearchPaletteOpen] = useState(false);
  const recentSpecialists = readRecentSpecialists();
  const engineQuery = useEngineStatusQuery();
  const systemVersionQuery = useSystemVersionQuery();
  const activeRunsQuery = useActiveTaskRunsQuery();
  const engineState = engineQuery.data?.state;
  const firstRun = systemVersionQuery.data?.firstRun;
  const activeRuns = activeRunsQuery.data ?? [];
  const runningRuns = activeRuns.filter((run) => run.status === "running");
  const queuedRuns = activeRuns.filter((run) => run.status === "queued");
  const [firstRunNoticeDismissed, setFirstRunNoticeDismissed] = useState(
    () => window.localStorage.getItem(FIRST_RUN_ENV_NOTICE_STORAGE_KEY) === "true",
  );
  const showFirstRunNotice = firstRun?.envFileCreated === true && !firstRunNoticeDismissed;

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? "true" : "false");
  }, [sidebarCollapsed]);

  useEffect(() => {
    setMobileSidebarOpen(false);
    setSearchPaletteOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) {
        return;
      }

      if (event.key.toLowerCase() !== "f") {
        return;
      }

      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (isTypingTarget) {
        return;
      }

      event.preventDefault();
      setSearchPaletteOpen(true);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-app-bg text-text-primary">
      <div
        className={`grid min-h-screen ${
          isDesktop
            ? sidebarCollapsed
              ? "lg:grid-cols-[4.5rem_minmax(0,1fr)]"
              : "lg:grid-cols-[15.5rem_minmax(0,1fr)]"
            : "grid-cols-1"
        }`}
      >
        {isDesktop ? (
          <aside
            className={`border-r border-border bg-sidebar py-[18px] ${sidebarCollapsed ? "px-2" : "px-3.5"}`}
          >
            <SidebarContent
              collapsed={sidebarCollapsed}
              pathname={pathname}
              recentSpecialists={recentSpecialists}
              onNavigate={() => undefined}
              onOpenSearch={() => setSearchPaletteOpen(true)}
              onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
            />
          </aside>
        ) : null}

        {!isDesktop && mobileSidebarOpen ? (
          <div
            className="fixed inset-0 z-50 bg-app-bg/75 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          >
            <aside
              className={`absolute inset-y-0 left-0 border-r border-border bg-sidebar py-[18px] shadow-2xl ${
                sidebarCollapsed ? "w-[4.5rem] px-2" : "w-[15.5rem] px-3.5"
              }`}
              onClick={(event) => event.stopPropagation()}
            >
              <SidebarContent
                collapsed={sidebarCollapsed}
                pathname={pathname}
                recentSpecialists={recentSpecialists}
                onNavigate={() => setMobileSidebarOpen(false)}
                onOpenSearch={() => setSearchPaletteOpen(true)}
                onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
              />
            </aside>
          </div>
        ) : null}

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-border bg-app-bg/90 backdrop-blur">
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3">
                {!isDesktop ? (
                  <button
                    aria-label="Open navigation"
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
                    onClick={() => setMobileSidebarOpen(true)}
                    type="button"
                  >
                    <Menu className="h-4 w-4" />
                  </button>
                ) : null}
                <h1 className="whitespace-nowrap text-sm font-semibold text-text-primary sm:text-xl">
                  {title}
                </h1>
                <EngineStatusBadge state={engineState} />
                {runningRuns.length > 0 ? <ActiveRunsBadge count={runningRuns.length} /> : null}
                {queuedRuns.length > 0 ? <QueuedRunsBadge count={queuedRuns.length} /> : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  aria-label="Open global search"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
                  onClick={() => setSearchPaletteOpen(true)}
                  type="button"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Search</span>
                  <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-text-secondary lg:inline-block">
                    cmd+Shift+F
                  </kbd>
                </button>
                <button
                  className="hidden h-9 items-center rounded-md border border-border bg-surface px-3 text-xs text-text-secondary transition hover:border-accent/50 hover:text-text-primary sm:inline-flex"
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
                <ActivityBell />
                <NavLink className="cc-button cc-button-secondary h-9 rounded-md" to="/profile">
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
      <GlobalSearchPalette onClose={() => setSearchPaletteOpen(false)} open={searchPaletteOpen} />
      {showFirstRunNotice ? (
        <FirstRunEnvNotice
          envFilePath={firstRun.envFilePath ?? "~/.cc/.env"}
          secretKey={firstRun.secretKey}
          onClose={() => {
            window.localStorage.setItem(FIRST_RUN_ENV_NOTICE_STORAGE_KEY, "true");
            setFirstRunNoticeDismissed(true);
          }}
        />
      ) : null}
    </div>
  );
}

function FirstRunEnvNotice(props: {
  envFilePath: string;
  secretKey?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const clipboardAvailable = typeof navigator !== "undefined" && Boolean(navigator.clipboard);

  async function copyKey(): Promise<void> {
    if (!clipboardAvailable || !props.secretKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(props.secretKey);
      setCopied(true);
    } catch {
      // Clipboard writes can reject (permission denied, insecure context, transient failure).
      // Leave the key visible so the owner can select and copy it manually.
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-app-bg/75 px-4 backdrop-blur-sm">
      <section
        aria-labelledby="first-run-env-title"
        className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-2xl"
        role="dialog"
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <h2 className="text-lg font-semibold text-text-primary" id="first-run-env-title">
              Save your CC_SECRET_KEY
            </h2>
            <p className="text-sm leading-6 text-text-secondary">
              {props.secretKey
                ? "CommandsCenter generated a secure CC_SECRET_KEY that encrypts your stored secrets. Copy it now and store it somewhere private — it will not be shown again."
                : `CommandsCenter created a secure CC_SECRET_KEY in ${props.envFilePath}. Copy that key and store it somewhere private. This notice will not be shown again.`}
            </p>
          </div>
          <div className="break-all rounded-md border border-border bg-app-bg px-3 py-2 font-mono text-xs text-text-secondary">
            {props.secretKey ?? props.envFilePath}
          </div>
          <div className="flex justify-end gap-2">
            {props.secretKey ? (
              <button
                className="cc-button cc-button-secondary inline-flex items-center gap-2"
                disabled={!clipboardAvailable}
                onClick={() => void copyKey()}
                title={clipboardAvailable ? "Copy key" : "Clipboard is unavailable"}
                type="button"
              >
                {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
            ) : null}
            <button className="cc-button cc-button-primary" onClick={props.onClose} type="button">
              I saved it
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function SidebarContent(props: {
  pathname: string;
  collapsed: boolean;
  recentSpecialists: ReturnType<typeof readRecentSpecialists>;
  onNavigate: () => void;
  onOpenSearch: () => void;
  onToggleCollapsed: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-[18px]">
      <div
        className={`flex items-center ${props.collapsed ? "justify-center" : "justify-between gap-2"}`}
      >
        {!props.collapsed ? (
          <>
            <NavLink
              aria-label="CommandsCenter"
              className="inline-flex min-w-0 items-center gap-2 px-1 py-1"
              onClick={props.onNavigate}
              to="/"
            >
              <AppLogo className="h-8 w-8 shrink-0" data-testid="app-logo" />
              <span className="text-[12px] font-bold uppercase leading-[1.2] tracking-[0.04em] text-text-primary">
                Commands
                <br />
                Center
              </span>
            </NavLink>
            <button
              aria-label="Collapse sidebar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
              onClick={props.onToggleCollapsed}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            aria-label="Expand sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
            onClick={props.onToggleCollapsed}
            type="button"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
      </div>

      {specialistsSidebarRoute ? (
        <section
          className={
            isRouteActive(
              props.pathname,
              specialistsSidebarRoute.path,
              specialistsSidebarRoute.navigationMatch,
            )
              ? "min-w-0 overflow-hidden rounded-xl border border-accent/30 bg-surface p-2.5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.55)]"
              : "min-w-0 overflow-hidden rounded-xl border border-border bg-surface p-2.5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.55)]"
          }
          data-testid={
            props.collapsed ? "recent-specialists-collapsed" : "recent-specialists-section"
          }
        >
          {props.collapsed ? (
            <SidebarRouteLink
              collapsed
              isActive={isRouteActive(
                props.pathname,
                specialistsSidebarRoute.path,
                specialistsSidebarRoute.navigationMatch,
              )}
              label={specialistsSidebarRoute.navLabel ?? specialistsSidebarRoute.title}
              onNavigate={props.onNavigate}
              to={specialistsSidebarRoute.path}
            >
              {specialistsSidebarRoute.navIcon}
            </SidebarRouteLink>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <NavLink
                  className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary transition hover:text-accent"
                  onClick={props.onNavigate}
                  to={specialistsSidebarRoute.path}
                >
                  {specialistsSidebarRoute.navIcon}
                  {specialistsSidebarRoute.navLabel}
                </NavLink>
                <NavLink
                  className="text-xs font-medium text-accent transition hover:text-accent-hover"
                  onClick={props.onNavigate}
                  to={specialistsSidebarRoute.path}
                >
                  See all
                </NavLink>
              </div>
              {props.recentSpecialists.length > 0 ? (
                <div className="mt-1 grid min-w-0 gap-0.5">
                  {props.recentSpecialists.map((agent) => (
                    <NavLink
                      className="block min-w-0 max-w-full overflow-hidden rounded-lg px-2 py-2 transition hover:bg-surface-elevated"
                      key={agent.slug}
                      onClick={props.onNavigate}
                      to={`/chat/${encodeURIComponent(agent.slug)}`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <SpecialistAvatar iconPath={agent.iconPath} name={agent.name} size="sm" />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {agent.name}
                          </p>
                          <p className="max-w-full truncate text-xs text-text-secondary">
                            {agent.role}
                          </p>
                        </div>
                      </div>
                    </NavLink>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-text-secondary">
                  Recent specialist chats will appear here after you open them from direct chat.
                </p>
              )}
            </>
          )}
        </section>
      ) : null}

      <nav className="grid gap-0.5" data-testid="sidebar-navigation">
        {dashboardSidebarRoute ? (
          <SidebarRouteLink
            collapsed={props.collapsed}
            isActive={isRouteActive(
              props.pathname,
              dashboardSidebarRoute.path,
              dashboardSidebarRoute.navigationMatch,
            )}
            label={dashboardSidebarRoute.navLabel ?? dashboardSidebarRoute.title}
            onNavigate={props.onNavigate}
            to={dashboardSidebarRoute.path}
          >
            {dashboardSidebarRoute.navIcon}
          </SidebarRouteLink>
        ) : null}
        {secondarySidebarRoutes.map((route) => {
          if (route.path === "/documents") {
            return (
              <DocumentsSidebarSection
                collapsed={props.collapsed}
                key={route.path}
                onNavigate={props.onNavigate}
                onOpenSearch={props.onOpenSearch}
                pathname={props.pathname}
              />
            );
          }

          if ((manageSidebarRoutePaths as readonly string[]).includes(route.path)) {
            // Render the whole "Manage" group once, at the first member's
            // position; skip the rest so they don't also render standalone.
            if (route.path !== manageSidebarRoutePaths[0]) {
              return null;
            }
            return (
              <ManageSidebarSection
                collapsed={props.collapsed}
                key="manage"
                onNavigate={props.onNavigate}
                pathname={props.pathname}
              />
            );
          }

          return (
            <SidebarRouteLink
              collapsed={props.collapsed}
              isActive={isRouteActive(props.pathname, route.path, route.navigationMatch)}
              key={route.path}
              label={route.navLabel ?? route.title}
              onNavigate={props.onNavigate}
              to={route.path}
            >
              {route.navIcon}
            </SidebarRouteLink>
          );
        })}
      </nav>
    </div>
  );
}

function SidebarRouteLink(props: {
  to: string;
  label: string;
  isActive: boolean;
  collapsed: boolean;
  onNavigate: () => void;
  children: ReactNode;
}) {
  return (
    <NavLink
      aria-label={props.label}
      className={
        props.collapsed
          ? [
              "flex h-10 items-center justify-center rounded-lg border transition",
              props.isActive
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-surface text-text-secondary hover:border-accent/40 hover:text-text-primary",
            ].join(" ")
          : props.isActive
            ? "cc-nav-item-active flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition"
            : "flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition hover:bg-surface hover:text-text-primary"
      }
      onClick={props.onNavigate}
      title={props.collapsed ? props.label : undefined}
      to={props.to}
    >
      {props.children}
      {!props.collapsed ? <span>{props.label}</span> : null}
    </NavLink>
  );
}

function ActiveRunsBadge(props: { count: number }) {
  return (
    <NavLink
      className="hidden items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-300 transition hover:border-amber-300/60 sm:inline-flex"
      to="/tasks?status=running"
      title="Active task runs can delay refresh, shutdown, or update operations until they finish."
    >
      <Clock3 className="h-3.5 w-3.5 animate-pulse" />
      {props.count} active {props.count === 1 ? "task" : "tasks"}
    </NavLink>
  );
}

function QueuedRunsBadge(props: { count: number }) {
  return (
    <NavLink
      className="hidden items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs text-accent transition hover:border-accent/50 sm:inline-flex"
      to="/tasks?status=queued"
      title="Queued task runs are waiting for their assigned specialist."
    >
      <ListChecks className="h-3.5 w-3.5" />
      {props.count} queued {props.count === 1 ? "task" : "tasks"}
    </NavLink>
  );
}

function readStoredSidebarCollapsed(): boolean {
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}

function EngineStatusBadge(props: { state: string | undefined }) {
  let dotClass: string;
  let label: string;
  let pulse = false;

  switch (props.state) {
    case "healthy":
      dotClass = "bg-emerald-500";
      label = "healthy";
      break;
    case "starting":
    case "stopping":
      dotClass = "bg-amber-400";
      label = props.state;
      pulse = true;
      break;
    case "unhealthy":
      dotClass = "bg-danger";
      label = "unhealthy";
      break;
    case undefined:
      dotClass = "bg-amber-400";
      label = "restarting";
      pulse = true;
      break;
    default:
      dotClass = "bg-text-secondary";
      label = "stopped";
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-text-secondary">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass} ${pulse ? "animate-pulse" : ""}`} />
      {label}
    </div>
  );
}
