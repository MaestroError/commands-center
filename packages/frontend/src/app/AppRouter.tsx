import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/shell/AppShell";

import { appRouteObjects } from "./routes";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {appRouteObjects.map((route) => (
          <Route element={route.element} key={route.path} path={route.path} />
        ))}
        <Route element={<Navigate replace to="/" />} path="*" />
      </Route>
    </Routes>
  );
}
