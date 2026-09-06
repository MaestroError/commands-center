import { isUsageUnknown, type UsageTotals } from "@cc/shared/schemas";

import { formatCompactCount, formatCost, type UsageRow } from "./usage-stats";

/**
 * Renders an aggregate total for a conversation, run, or task.
 *
 * Returns "—" rather than "0" when nothing in scope reported usage: those
 * messages predate the metrics columns or are still to be synced, and a
 * confident zero would be a claim we cannot make.
 */
export function formatUsageTotal(usage: UsageTotals): string {
  if (isUsageUnknown(usage)) return "—";

  return `${formatCompactCount(usage.totalTokens)} tokens`;
}

/** True when only some of the replies in scope reported usage. */
export function isUsagePartial(usage: UsageTotals): boolean {
  return !isUsageUnknown(usage) && usage.countedMessageCount < usage.assistantMessageCount;
}

export function buildUsageTotalRows(usage: UsageTotals): UsageRow[] {
  if (isUsageUnknown(usage)) {
    return [
      {
        label: "Usage",
        value: usage.messageCount === 0 ? "No messages yet" : "Not recorded for these messages",
      },
    ];
  }

  const rows: UsageRow[] = [
    { label: "Total tokens", value: usage.totalTokens.toLocaleString("en-US") },
  ];

  if (usage.tokens) {
    rows.push({ label: "Input", value: usage.tokens.input.toLocaleString("en-US") });
    rows.push({ label: "Output", value: usage.tokens.output.toLocaleString("en-US") });
    if (usage.tokens.reasoning > 0) {
      rows.push({ label: "Reasoning", value: usage.tokens.reasoning.toLocaleString("en-US") });
    }
    if (usage.tokens.cacheRead > 0) {
      rows.push({ label: "Cache read", value: usage.tokens.cacheRead.toLocaleString("en-US") });
    }
    if (usage.tokens.cacheWrite > 0) {
      rows.push({ label: "Cache write", value: usage.tokens.cacheWrite.toLocaleString("en-US") });
    }
  }

  if (usage.cost !== undefined) {
    rows.push({ label: "Cost", value: formatCost(usage.cost) });
  }

  if (isUsagePartial(usage)) {
    rows.push({
      label: "Coverage",
      value: `${String(usage.countedMessageCount)} of ${String(usage.assistantMessageCount)} replies`,
      detail: true,
    });
  }

  return rows;
}
