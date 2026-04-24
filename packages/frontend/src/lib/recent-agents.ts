export type RecentAgent = {
  id: string;
  slug: string;
  name: string;
  role: string;
  lastVisitedAt: string;
};

export const RECENT_AGENTS_STORAGE_KEY = "cc.recent-agents";
const MAX_RECENT_AGENTS = 3;

export function readRecentAgents(): RecentAgent[] {
  const raw = window.localStorage.getItem(RECENT_AGENTS_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isRecentAgent).slice(0, MAX_RECENT_AGENTS);
  } catch {
    return [];
  }
}

export function recordRecentAgent(agent: Omit<RecentAgent, "lastVisitedAt">): void {
  const nextAgent: RecentAgent = {
    ...agent,
    lastVisitedAt: new Date().toISOString(),
  };
  const next = [
    nextAgent,
    ...readRecentAgents().filter((entry) => entry.slug !== agent.slug),
  ].slice(0, MAX_RECENT_AGENTS);

  window.localStorage.setItem(RECENT_AGENTS_STORAGE_KEY, JSON.stringify(next));
}

function isRecentAgent(value: unknown): value is RecentAgent {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "slug" in value &&
    typeof value.slug === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "role" in value &&
    typeof value.role === "string" &&
    "lastVisitedAt" in value &&
    typeof value.lastVisitedAt === "string"
  );
}
