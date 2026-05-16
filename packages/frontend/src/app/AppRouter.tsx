import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "@/components/shell/AppShell";
import { useOwnerAuth } from "@/context/use-owner-auth";
import { ClaimPage } from "@/pages/ClaimPage";
import { LoginPage } from "@/pages/LoginPage";

import { appRouteObjects } from "./routes";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<PublicAuthRoute page="claim" />} path="/claim" />
      <Route element={<PublicAuthRoute page="login" />} path="/login" />
      <Route element={<ProtectedAppRoute />}>
        <Route element={<AppShell />}>
          {appRouteObjects.map((route) => (
            <Route element={route.element} key={route.path} path={route.path} />
          ))}
          <Route element={<Navigate replace to="/" />} path="*" />
        </Route>
      </Route>
    </Routes>
  );
}

function ProtectedAppRoute() {
  const auth = useOwnerAuth();
  const location = useLocation();

  if (auth.loading) {
    return <AuthLoading />;
  }

  if (auth.status === "unclaimed") {
    return <Navigate replace state={{ from: location }} to="/claim" />;
  }

  if (auth.status === "claimed-unauthenticated") {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  return <Outlet />;
}

function PublicAuthRoute(props: { page: "claim" | "login" }) {
  const auth = useOwnerAuth();
  const location = useLocation();
  const forwardedState = location.state as unknown;

  if (auth.loading) {
    return <AuthLoading />;
  }

  if (auth.status === "claimed-authenticated") {
    return <Navigate replace to={getRedirectPath(forwardedState)} />;
  }

  if (props.page === "claim") {
    if (auth.status === "claimed-unauthenticated") {
      return <Navigate replace state={forwardedState} to="/login" />;
    }

    return <ClaimPage />;
  }

  if (auth.status === "unclaimed") {
    return <Navigate replace state={forwardedState} to="/claim" />;
  }

  return <LoginPage />;
}

function AuthLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-4 text-text-primary">
      <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
        Loading owner access...
      </div>
    </main>
  );
}

function getRedirectPath(state: unknown): string {
  if (state && typeof state === "object" && "from" in state) {
    const from = state.from;
    if (
      from &&
      typeof from === "object" &&
      "pathname" in from &&
      typeof from.pathname === "string"
    ) {
      if (from.pathname !== "/claim" && from.pathname !== "/login") {
        return from.pathname;
      }
    }
  }

  return "/";
}
