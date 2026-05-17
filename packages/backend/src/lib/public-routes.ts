export type PublicRoute = {
  method: string;
  path: string | RegExp;
};

export const PUBLIC_ROUTES: PublicRoute[] = [
  { method: "GET", path: "/api/health" },
  { method: "GET", path: "/api/auth/status" },
  { method: "POST", path: "/api/auth/claim" },
  { method: "POST", path: "/api/auth/login" },
  { method: "POST", path: "/api/auth/logout" },
  { method: "POST", path: "/api/auth/reclaim" },
];

export function isPublicRoute(method: string, pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => {
    if (route.method !== method.toUpperCase()) {
      return false;
    }

    if (typeof route.path === "string") {
      return route.path === pathname;
    }

    return route.path.test(pathname);
  });
}
