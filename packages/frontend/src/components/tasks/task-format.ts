import type { TaskRepeatRule } from "@cc/shared/schemas";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatToken(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleString() : "Not set";
}

export function formatRepeatSummary(rule: TaskRepeatRule): string {
  if (rule.frequency === "hour" && rule.interval === 1) return "Every hour";

  const unit = rule.interval === 1 ? rule.frequency : `${rule.frequency}s`;
  const weekdays = rule.weekdays?.map(formatWeekday).filter(Boolean);
  return `Every ${String(rule.interval)} ${unit}${weekdays?.length ? ` on ${weekdays.join(", ")}` : ""}`;
}

export function formatWeekday(value: number): string | undefined {
  return WEEKDAY_LABELS[value];
}
