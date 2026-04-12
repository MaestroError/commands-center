import type { ReactNode } from "react";

import type { RouteObject } from "react-router-dom";

import { DashboardPage } from "@/pages/DashboardPage";
import { FileManagerPage } from "@/pages/FileManagerPage";
import { GenericPlaceholderPage } from "@/pages/GenericPlaceholderPage";
import { AgentEditorPage } from "@/pages/AgentEditorPage";
import { AgentsPage } from "@/pages/AgentsPage";
import { BuiltInSkillsPage } from "@/pages/BuiltInSkillsPage";
import { IntegrationsPage } from "@/pages/IntegrationsPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { ProviderConnectionsPage } from "@/pages/ProviderConnectionsPage";
import { WorkspaceChatPage } from "@/pages/WorkspaceChatPage";

type AppRouteDefinition = {
  path: string;
  title: string;
  navLabel?: string;
  navigationMatch?: string[];
  element: ReactNode;
};

export const appRoutes = [
  {
    path: "/",
    title: "Dashboard",
    navLabel: "Dashboard",
    element: <DashboardPage />,
  },
  {
    path: "/agents",
    title: "Agents",
    navLabel: "Agents",
    navigationMatch: ["/agents/new", "/agents/:slug/edit"],
    element: <AgentsPage />,
  },
  {
    path: "/agents/new",
    title: "Create Agent",
    element: <AgentEditorPage mode="create" />,
  },
  {
    path: "/agents/:slug/edit",
    title: "Edit Agent",
    element: <AgentEditorPage mode="edit" />,
  },
  {
    path: "/chat/:agentId",
    title: "Direct Chat",
    element: <WorkspaceChatPage />,
  },
  {
    path: "/files",
    title: "File Manager",
    navLabel: "File Manager",
    element: <FileManagerPage />,
  },
  {
    path: "/terminal",
    title: "Global Terminal",
    navLabel: "Global Terminal",
    element: (
      <GenericPlaceholderPage
        title="Global Terminal"
        description="Host-level terminals will live in the bottom work surface without leaving the shared shell."
        withBottomPane
      />
    ),
  },
  {
    path: "/automations",
    title: "Automations",
    navLabel: "Automations",
    element: (
      <GenericPlaceholderPage
        title="Automations"
        description="Scheduled prompts, run history, and automation management will build on the foundation added in this epic."
      />
    ),
  },
  {
    path: "/tools",
    title: "Custom Tools",
    navLabel: "Custom Tools",
    element: (
      <GenericPlaceholderPage
        title="Custom Tools"
        description="Global tool definitions will share the same loading, empty, and error patterns introduced here."
      />
    ),
  },
  {
    path: "/skills",
    title: "Built-in Skills",
    navLabel: "Built-in Skills",
    element: <BuiltInSkillsPage />,
  },
  {
    path: "/integrations",
    title: "Integrations",
    navLabel: "Integrations",
    element: <IntegrationsPage />,
  },
  {
    path: "/providers",
    title: "Provider Connections",
    navLabel: "Provider Connections",
    element: <ProviderConnectionsPage />,
  },
  {
    path: "/settings",
    title: "Settings",
    navLabel: "Settings",
    element: (
      <GenericPlaceholderPage
        title="Settings"
        description="Runtime preferences and update controls will build on this semantic theming and shell foundation."
      />
    ),
  },
  {
    path: "/profile",
    title: "Profile",
    element: <ProfilePage />,
  },
] satisfies AppRouteDefinition[];

export const sidebarRoutes = appRoutes.filter((route) => route.navLabel);

export const dashboardSidebarRoute = sidebarRoutes.find((route) => route.path === "/");

export const agentsSidebarRoute = sidebarRoutes.find((route) => route.path === "/agents");

export const secondarySidebarRoutes = sidebarRoutes.filter(
  (route) => route.path !== "/" && route.path !== "/agents",
);

export const appRouteObjects = appRoutes.map((route) => ({
  path: route.path,
  element: route.element,
})) satisfies RouteObject[];

export function getRouteTitle(pathname: string): string {
  const activeRoute = appRoutes.find((route) => matchesRoute(pathname, route.path));
  return activeRoute?.title ?? "CommandsCenter";
}

export function isRouteActive(
  pathname: string,
  routePath: string,
  navigationMatch?: string[],
): boolean {
  if (matchesRoute(pathname, routePath)) {
    return true;
  }

  return navigationMatch?.some((candidate) => matchesRoute(pathname, candidate)) ?? false;
}

function matchesRoute(pathname: string, routePath: string): boolean {
  if (routePath === "/") {
    return pathname === "/";
  }

  const routeParts = routePath.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);

  if (routeParts.length !== pathParts.length) {
    return false;
  }

  return routeParts.every((part, index) => part.startsWith(":") || part === pathParts[index]);
}
