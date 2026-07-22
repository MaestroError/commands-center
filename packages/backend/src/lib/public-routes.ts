export type PublicRoute = {
  method: string;
  path: string | RegExp;
};

export const PUBLIC_ROUTES: PublicRoute[] = [
  { method: "GET", path: "/api/health" },
  { method: "GET", path: "/api/auth/status" },
  { method: "GET", path: "/api/auth/csrf" },
  { method: "POST", path: "/api/auth/claim" },
  { method: "POST", path: "/api/auth/login" },
  { method: "POST", path: "/api/auth/logout" },
  { method: "POST", path: "/api/auth/reclaim" },
  { method: "GET", path: "/.well-known/oauth-protected-resource/api/public/mcp" },
  { method: "GET", path: "/.well-known/oauth-authorization-server/oauth" },
  { method: "GET", path: "/oauth/.well-known/openid-configuration" },
  { method: "GET", path: "/oauth/authorize" },
  { method: "GET", path: /^\/oauth\/authorize\/[^/]+$/ },
  { method: "POST", path: "/oauth/token" },
  { method: "OPTIONS", path: "/oauth/token" },
  { method: "POST", path: "/oauth/register" },
  { method: "POST", path: "/oauth/revoke" },
  { method: "OPTIONS", path: "/oauth/revoke" },
  { method: "GET", path: "/oauth/jwks" },
  { method: "OPTIONS", path: "/oauth/jwks" },
  { method: "GET", path: /^\/api\/oauth\/interactions\/[^/]+$/ },
  { method: "POST", path: /^\/api\/oauth\/interactions\/[^/]+$/ },
  { method: "GET", path: /^\/api\/mcp\/cc\/[^/]+\/specialists\/[^/]+$/ },
  { method: "POST", path: /^\/api\/mcp\/cc\/[^/]+\/specialists\/[^/]+$/ },
  { method: "DELETE", path: /^\/api\/mcp\/cc\/[^/]+\/specialists\/[^/]+$/ },
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
