// Backend-only mapping from a public REST route (method + pathname) to the
// single capability id that gates it. This is the one place that knows HTTP
// paths; the shared capability catalog carries no route data so it stays
// isomorphic. The public MCP registry (Phase 2) binds the same capability ids to
// MCP tools — one capability, two surfaces.

type Matcher = {
  method: string;
  pattern: RegExp;
  capability: string;
};

// Ordered most-specific first so `/tasks/:id/runs/:runId` is matched before
// `/tasks/:id/runs` and `/tasks/:id`.
const ROUTE_CAPABILITIES: readonly Matcher[] = [
  {
    method: "GET",
    pattern: /^\/api\/public\/v1\/task-templates$/,
    capability: "list_task_templates",
  },
  {
    method: "POST",
    pattern: /^\/api\/public\/v1\/task-templates\/[^/]+\/trigger$/,
    capability: "trigger_task_template",
  },
  {
    method: "POST",
    pattern: /^\/api\/public\/v1\/task-templates\/[^/]+\/enable$/,
    capability: "enable_task_template",
  },
  {
    method: "POST",
    pattern: /^\/api\/public\/v1\/task-templates\/[^/]+\/disable$/,
    capability: "disable_task_template",
  },
  {
    method: "GET",
    pattern: /^\/api\/public\/v1\/task-runs\/[^/]+$/,
    capability: "get_task_run",
  },
  {
    method: "GET",
    pattern: /^\/api\/public\/v1\/specialists$/,
    capability: "list_specialists",
  },
  {
    method: "GET",
    pattern: /^\/api\/public\/v1\/tasks$/,
    capability: "list_tasks",
  },
  {
    method: "POST",
    pattern: /^\/api\/public\/v1\/tasks$/,
    capability: "create_task",
  },
  {
    method: "POST",
    pattern: /^\/api\/public\/v1\/tasks\/[^/]+\/trigger$/,
    capability: "trigger_task",
  },
  {
    method: "POST",
    pattern: /^\/api\/public\/v1\/tasks\/[^/]+\/schedule$/,
    capability: "schedule_task",
  },
  {
    method: "GET",
    pattern: /^\/api\/public\/v1\/tasks\/[^/]+\/runs\/[^/]+$/,
    capability: "get_task_run_detail",
  },
  {
    method: "GET",
    pattern: /^\/api\/public\/v1\/tasks\/[^/]+\/runs$/,
    capability: "list_task_runs",
  },
  {
    method: "GET",
    pattern: /^\/api\/public\/v1\/tasks\/[^/]+\/feedback$/,
    capability: "list_task_feedback",
  },
  {
    method: "GET",
    pattern: /^\/api\/public\/v1\/tasks\/[^/]+$/,
    capability: "get_task",
  },
];

/** Resolve the capability id required for a public REST route, or undefined. */
export function capabilityForPublicRoute(method: string, pathname: string): string | undefined {
  const normalizedMethod = method.toUpperCase();

  return ROUTE_CAPABILITIES.find(
    (matcher) => matcher.method === normalizedMethod && matcher.pattern.test(pathname),
  )?.capability;
}
