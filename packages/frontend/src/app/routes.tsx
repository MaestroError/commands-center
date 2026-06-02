import type { ReactNode } from "react";
import {
  Code2,
  Clock3,
  FolderKanban,
  Home,
  KeyRound,
  PlugZap,
  Settings,
  Sparkles,
  Terminal,
  Users,
  Wrench,
} from "lucide-react";

import type { RouteObject } from "react-router-dom";

import { DashboardPage } from "@/pages/DashboardPage";
import { ApiPage } from "@/pages/ApiPage";
import { FileManagerPage } from "@/pages/FileManagerPage";
import { AgentEditorPage } from "@/pages/AgentEditorPage";
import { AgentsPage } from "@/pages/AgentsPage";
import { BuiltInSkillsPage } from "@/pages/BuiltInSkillsPage";
import { CustomToolsPage } from "@/pages/CustomToolsPage";
import { IntegrationsPage } from "@/pages/IntegrationsPage";
import { LazyGlobalTerminalPage } from "@/pages/LazyGlobalTerminalPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { ProviderConnectionsPage } from "@/pages/ProviderConnectionsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TaskDetailPage } from "@/pages/TaskDetailPage";
import { TasksPage } from "@/pages/TasksPage";
import { WorkspaceChatPage } from "@/pages/WorkspaceChatPage";

type AppRouteDefinition = {
  path: string;
  title: string;
  navLabel?: string;
  navIcon?: ReactNode;
  navigationMatch?: string[];
  element: ReactNode;
};

export const appRoutes = [
  {
    path: "/",
    title: "Dashboard",
    navLabel: "Dashboard",
    navIcon: <Home className="h-4 w-4 shrink-0" />,
    element: <DashboardPage />,
  },
  {
    path: "/agents",
    title: "Agents",
    navLabel: "Agents",
    navIcon: <Users className="h-4 w-4 shrink-0" />,
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
    path: "/chat/:agentId/:conversationId",
    title: "Direct Chat",
    element: <WorkspaceChatPage />,
  },
  {
    path: "/tasks",
    title: "Tasks",
    navLabel: "Tasks",
    navIcon: <Clock3 className="h-4 w-4 shrink-0" />,
    navigationMatch: [
      "/tasks/new",
      "/tasks/:id",
      "/tasks/:id/edit",
      "/tasks/:id/runs/:runId",
      "/tasks/templates/:id/edit",
    ],
    element: <TasksPage />,
  },
  {
    path: "/tasks/new",
    title: "Create Task",
    element: <TasksPage mode="create" />,
  },
  {
    path: "/tasks/:id",
    title: "Task Detail",
    element: <TaskDetailPage />,
  },
  {
    path: "/tasks/:id/edit",
    title: "Edit Task",
    element: <TasksPage mode="edit" />,
  },
  {
    path: "/tasks/:id/runs/:runId",
    title: "Task Run",
    element: <TaskDetailPage mode="run" />,
  },
  {
    path: "/tasks/templates/:id/edit",
    title: "Edit Task Template",
    element: <TasksPage mode="template-edit" />,
  },
  {
    path: "/skills",
    title: "Skills Library",
    navLabel: "Skills",
    navIcon: <Sparkles className="h-4 w-4 shrink-0" />,
    element: <BuiltInSkillsPage />,
  },
  {
    path: "/integrations",
    title: "Integrations",
    navLabel: "Integrations",
    navIcon: <PlugZap className="h-4 w-4 shrink-0" />,
    element: <IntegrationsPage />,
  },
  {
    path: "/files",
    title: "File Manager",
    navLabel: "File Manager",
    navIcon: <FolderKanban className="h-4 w-4 shrink-0" />,
    element: <FileManagerPage />,
  },
  {
    path: "/terminal",
    title: "Global Terminal",
    navLabel: "Global Terminal",
    navIcon: <Terminal className="h-4 w-4 shrink-0" />,
    element: <LazyGlobalTerminalPage />,
  },
  {
    path: "/tools",
    title: "Custom Tools",
    navLabel: "Custom Tools",
    navIcon: <Wrench className="h-4 w-4 shrink-0" />,
    element: <CustomToolsPage />,
  },
  {
    path: "/providers",
    title: "Provider Connections",
    navLabel: "Provider Connections",
    navIcon: <KeyRound className="h-4 w-4 shrink-0" />,
    element: <ProviderConnectionsPage />,
  },
  {
    path: "/developer-api",
    title: "API",
    navLabel: "API",
    navIcon: <Code2 className="h-4 w-4 shrink-0" />,
    element: <ApiPage />,
  },
  {
    path: "/settings",
    title: "Settings",
    navLabel: "Settings",
    navIcon: <Settings className="h-4 w-4 shrink-0" />,
    element: <SettingsPage />,
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

export function matchesRoute(pathname: string, routePath: string): boolean {
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
