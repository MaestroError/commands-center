export type RecentSpecialist = {
  id: string;
  slug: string;
  name: string;
  role: string;
  iconPath?: string;
  lastVisitedAt: string;
};

export const RECENT_SPECIALISTS_STORAGE_KEY = "cc.recent-specialists";
const MAX_RECENT_SPECIALISTS = 3;

export function readRecentSpecialists(): RecentSpecialist[] {
  const raw = window.localStorage.getItem(RECENT_SPECIALISTS_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isRecentSpecialist).slice(0, MAX_RECENT_SPECIALISTS);
  } catch {
    return [];
  }
}

export function recordRecentSpecialist(specialist: Omit<RecentSpecialist, "lastVisitedAt">): void {
  const nextSpecialist: RecentSpecialist = {
    ...specialist,
    lastVisitedAt: new Date().toISOString(),
  };
  const next = [
    nextSpecialist,
    ...readRecentSpecialists().filter((entry) => entry.slug !== specialist.slug),
  ].slice(0, MAX_RECENT_SPECIALISTS);

  window.localStorage.setItem(RECENT_SPECIALISTS_STORAGE_KEY, JSON.stringify(next));
}

function isRecentSpecialist(value: unknown): value is RecentSpecialist {
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
    (!("iconPath" in value) ||
      value.iconPath === undefined ||
      typeof value.iconPath === "string") &&
    "lastVisitedAt" in value &&
    typeof value.lastVisitedAt === "string"
  );
}
