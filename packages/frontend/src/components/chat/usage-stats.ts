import type {
  ConversationMessage,
  ConversationMessageTokens,
  ConversationPart,
} from "@cc/shared/schemas";
import { readOpenCodeCost, sumOpenCodeTokens } from "@cc/shared/lib";
import { sumConversationMessageTokens } from "@cc/shared/schemas";

/**
 * Token and timing figures for one message or tool call.
 *
 * Tokens and cost come from the message's own persisted columns when it has
 * them. Otherwise they are summed from its `step-finish` parts, which OpenCode
 * has always shipped inside `parts_json` — see `readMessageUsage` for when each
 * source applies. Tool timing has only one source: `state.time.{start,end}` on
 * the tool part.
 */

export type MessageUsage = {
  tokens?: ConversationMessageTokens;
  /**
   * Provider-reported cost in USD. Undefined when the provider reports nothing
   * billable — subscription and OAuth models report a literal 0, which is an
   * absence of data rather than a free request, so we never render it as "$0".
   */
  cost?: number;
  /** How many model steps were folded into these totals. */
  steps: number;
  /** Qualified model that produced the message, e.g. `anthropic/claude-opus-5`. */
  model?: string;
  /** OpenCode agent that produced the message. */
  agent?: string;
  /** Why the turn stopped, when reported. */
  finish?: string;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
};

export type ToolUsage = {
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
};

export type UsageRow = {
  label: string;
  value: string;
  /** Groups rows under a heading, so unrelated figures cannot be misread as one set. */
  section?: string;
  /**
   * Reference detail rather than glanceable figures. The hover card drops these
   * to stay compact; the dialog shows every row.
   */
  detail?: boolean;
};

export function readMessageUsage(
  message: ConversationMessage,
  parts: ConversationPart[],
): MessageUsage | null {
  if (message.role !== "assistant") return null;

  const steps = parts.filter((part) => part.type === "step-finish");

  // The persisted figures are OpenCode's own accounting and win when present.
  // The `step-finish` fallback below is not merely legacy support: SSE message
  // events carry no usage fields (see `sseMessageSchema`), so every in-flight
  // message renders through it until the next sync, as does every message
  // stored before CC grew the columns. Do not remove it.
  const tokens = message.tokens ?? sumOpenCodeTokens(steps.map((step) => step["tokens"]));
  const cost = message.cost ?? sumStepCost(steps);
  const model = readModel(message);
  const agent = message.agent;
  const finish = message.finish;

  const startedAt = parseTimestamp(message.createdAt);
  const endedAt = parseTimestamp(message.updatedAt);
  const durationMs = readSpan(startedAt, endedAt);

  if (
    !tokens &&
    cost === undefined &&
    durationMs === undefined &&
    model === undefined &&
    agent === undefined
  ) {
    return null;
  }

  return {
    ...(tokens ? { tokens } : {}),
    ...(cost === undefined ? {} : { cost }),
    steps: steps.length,
    ...(model === undefined ? {} : { model }),
    ...(agent === undefined ? {} : { agent }),
    ...(finish === undefined ? {} : { finish }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(endedAt === undefined ? {} : { endedAt }),
    ...(durationMs === undefined ? {} : { durationMs }),
  };
}

function readModel(message: ConversationMessage): string | undefined {
  if (!message.modelId) return undefined;
  return message.providerId ? `${message.providerId}/${message.modelId}` : message.modelId;
}

export function readToolUsage(part: ConversationPart): ToolUsage | null {
  const state = part["state"];
  if (!isRecord(state)) return null;

  const time = state["time"];
  if (!isRecord(time)) return null;

  const startedAt = readNumber(time["start"]);
  const endedAt = readNumber(time["end"]);
  if (startedAt === undefined && endedAt === undefined) return null;

  const durationMs = readSpan(startedAt, endedAt);

  return {
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(endedAt === undefined ? {} : { endedAt }),
    ...(durationMs === undefined ? {} : { durationMs }),
  };
}

export function buildMessageUsageRows(usage: MessageUsage): UsageRow[] {
  const rows: UsageRow[] = [];

  if (usage.model !== undefined) {
    rows.push({ label: "Model", value: usage.model });
  }
  if (usage.agent !== undefined) {
    rows.push({ label: "Agent", value: usage.agent, detail: true });
  }
  if (usage.finish !== undefined) {
    rows.push({ label: "Finish", value: usage.finish, detail: true });
  }
  if (usage.durationMs !== undefined) {
    rows.push({ label: "Duration", value: formatDuration(usage.durationMs) });
  }
  if (usage.tokens) {
    const { input, output, reasoning, cacheRead, cacheWrite } = usage.tokens;
    // Summed from the components rather than the provider's own total, which is
    // inconsistent about whether it counts reasoning and cache.
    rows.push({
      label: "Total tokens",
      value: formatCount(sumConversationMessageTokens(usage.tokens)),
    });
    rows.push({ label: "Input", value: formatCount(input) });
    rows.push({ label: "Output", value: formatCount(output) });
    if (reasoning > 0) rows.push({ label: "Reasoning", value: formatCount(reasoning) });
    if (cacheRead > 0) rows.push({ label: "Cache read", value: formatCount(cacheRead) });
    if (cacheWrite > 0) rows.push({ label: "Cache write", value: formatCount(cacheWrite) });
  }
  if (usage.cost !== undefined) {
    rows.push({ label: "Cost", value: formatCost(usage.cost) });
  }
  if (usage.steps > 1) {
    rows.push({ label: "Model steps", value: formatCount(usage.steps) });
  }
  if (usage.startedAt !== undefined) {
    rows.push({ label: "Started", value: formatTimestamp(usage.startedAt), detail: true });
  }
  if (usage.endedAt !== undefined && usage.endedAt !== usage.startedAt) {
    rows.push({ label: "Finished", value: formatTimestamp(usage.endedAt), detail: true });
  }

  return rows;
}

export function buildToolUsageRows(usage: ToolUsage): UsageRow[] {
  const rows: UsageRow[] = [];

  if (usage.durationMs !== undefined) {
    rows.push({ label: "Duration", value: formatDuration(usage.durationMs) });
  }
  if (usage.startedAt !== undefined) {
    rows.push({ label: "Started", value: formatTimestamp(usage.startedAt), detail: true });
  }
  if (usage.endedAt !== undefined) {
    rows.push({ label: "Finished", value: formatTimestamp(usage.endedAt), detail: true });
  }

  return rows;
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${String(Math.round(durationMs))}ms`;

  if (durationMs < 60_000) {
    const seconds = durationMs / 1000;
    // Keep a decimal for short calls, where 1.4s vs 1.9s is a real difference.
    return seconds < 10 ? `${seconds.toFixed(1)}s` : `${String(Math.round(seconds))}s`;
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${String(minutes)}m` : `${String(minutes)}m ${String(seconds)}s`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatCompactCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function formatCost(cost: number): string {
  // Per-message costs land in fractions of a cent, so two decimals would round
  // nearly everything to $0.00.
  return cost < 0.01 ? `$${cost.toFixed(5)}` : `$${cost.toFixed(4)}`;
}

function formatTimestamp(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function sumStepCost(steps: ConversationPart[]): number | undefined {
  // readOpenCodeCost drops each step's zero, so a run of unbilled steps sums to
  // nothing and stays undefined rather than rendering as "$0.00".
  const total = steps.reduce((sum, step) => sum + (readOpenCodeCost(step["cost"]) ?? 0), 0);
  return total > 0 ? total : undefined;
}

function readSpan(startedAt?: number, endedAt?: number): number | undefined {
  if (startedAt === undefined || endedAt === undefined) return undefined;

  const span = endedAt - startedAt;
  return span > 0 ? span : undefined;
}

function parseTimestamp(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
