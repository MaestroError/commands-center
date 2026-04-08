import { useEffect, useState } from "react";

import { ProviderConnectionsPage } from "@/pages/ProviderConnectionsPage";

const PROVIDER_ROUTE = "/providers";

export function App() {
  const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    if (window.location.pathname !== PROVIDER_ROUTE) {
      window.history.replaceState({}, "", PROVIDER_ROUTE);
      setPathname(PROVIDER_ROUTE);
    }

    const handlePopstate = () => {
      setPathname(normalizePath(window.location.pathname));
    };

    window.addEventListener("popstate", handlePopstate);
    return () => window.removeEventListener("popstate", handlePopstate);
  }, []);

  function navigate(path: string) {
    if (path === pathname) {
      return;
    }

    window.history.pushState({}, "", path);
    setPathname(path);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#164e63_0%,_#020617_45%,_#020617_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:flex-row">
        <aside className="border-b border-white/10 bg-slate-950/80 p-4 backdrop-blur lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
          <div className="rounded-3xl border border-cyan-400/15 bg-cyan-400/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
              CommandsCenter
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Provider setup</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Minimal routing for the current epic, focused on authenticating providers and
              verifying their models.
            </p>
          </div>

          <nav className="mt-6 grid gap-2">
            <button
              className={
                pathname === PROVIDER_ROUTE ? "cc-nav-item cc-nav-item-active" : "cc-nav-item"
              }
              onClick={() => navigate(PROVIDER_ROUTE)}
              type="button"
            >
              Provider Connections
            </button>
          </nav>
        </aside>

        <ProviderConnectionsPage active={pathname === PROVIDER_ROUTE} />
      </div>
    </div>
  );
}

function normalizePath(pathname: string): string {
  return pathname === "/" ? PROVIDER_ROUTE : pathname;
}
