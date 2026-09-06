import type { ConversationMessage, ConversationPart, Provider } from "@cc/shared/schemas";

import { sumConversationMessageTokens } from "@cc/shared/schemas";
import { readOpenCodeTokens } from "@cc/shared/lib";

/**
 * How much of the model's context window the conversation is using.
 *
 * "Used" is the state of the window right now, matching how OpenCode computes
 * it for its own UI (`session-context-metrics.ts`): every component of the
 * newest assistant turn that reported any tokens.
 *
 * Summary turns count. A `/compact` writes one, and it becomes the new
 * baseline the next request builds from — so the figure drops as soon as the
 * compaction lands, which is the entire point of watching it. Deliberately
 * kept identical to upstream so this number agrees with what OpenCode itself
 * would show, rather than being our own opinion of the same thing.
 *
 * This is not the tokens the conversation has spent. That total keeps counting
 * across compactions and is reported separately.
 *
 * The limit is per provider *and* model, not per model: the same model is
 * offered with different context windows by different providers.
 */
export type ContextWindow = {
  usedTokens: number;
  limitTokens: number;
  /** 0–1, clamped: a provider's advertised limit is not always the hard one. */
  fraction: number;
  model: string;
};

export function readContextWindow(input: {
  messages: ConversationMessage[];
  parts: Record<string, ConversationPart[]>;
  providers: Provider[];
  /** `provider/model` from the specialist, used when a message names none. */
  fallbackModel?: string;
}): ContextWindow | null {
  const latest = findLatestUsage(input.messages, input.parts);
  if (!latest) return null;

  const identity = readModelIdentity(latest.message, input.fallbackModel);
  if (!identity) return null;

  const limitTokens = readContextLimit(input.providers, identity);
  if (limitTokens === undefined || limitTokens <= 0) return null;

  const usedTokens = latest.total;
  if (usedTokens <= 0) return null;

  return {
    usedTokens,
    limitTokens,
    fraction: Math.min(1, usedTokens / limitTokens),
    model: `${identity.providerId}/${identity.modelId}`,
  };
}

/** Compact and precise enough to watch a window fill: `521.6k`, `1M`. */
export function formatContextCount(value: number): string {
  if (value < 1_000) return String(Math.round(value));

  const [scaled, suffix] =
    value < 1_000_000 ? [value / 1_000, "k"] : ([value / 1_000_000, "M"] as const);
  const rendered = scaled.toFixed(1).replace(/\.0$/, "");

  return `${rendered}${suffix}`;
}

export function formatContextSummary(context: ContextWindow): string {
  const percent = Math.round(context.fraction * 100);

  return `${formatContextCount(context.usedTokens)} / ${formatContextCount(
    context.limitTokens,
  )} (${String(percent)}%)`;
}

function findLatestUsage(
  messages: ConversationMessage[],
  parts: Record<string, ConversationPart[]>,
): { message: ConversationMessage; total: number } | null {
  // Newest assistant turn that reported anything, summary turns included —
  // mirrors OpenCode's own lastAssistantWithTokens.
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") continue;

    const total = readLatestCallTokens(message, parts[message.id] ?? message.parts);
    if (total === undefined || total <= 0) continue;

    return { message, total };
  }

  return null;
}

/**
 * Tokens for the turn's *last model call*, which is what occupies the window.
 *
 * Deliberately not `readMessageUsage`: that sums a multi-step turn's steps,
 * because spending accumulates across calls. Occupancy does not — each call
 * re-sends the conversation, so two 100k steps mean a 100k window, not 200k.
 * The last `step-finish` part is the latest call; the stored message totals are
 * only equivalent when the turn had a single step.
 */
function readLatestCallTokens(
  message: ConversationMessage,
  parts: ConversationPart[],
): number | undefined {
  const steps = parts.filter((part) => part.type === "step-finish");

  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const tokens = readOpenCodeTokens(steps[index]?.["tokens"]);
    if (tokens) return sumConversationMessageTokens(tokens);
  }

  // No step parts to read: the message totals are the only report available,
  // and for a single-step turn they are exactly the last call.
  return message.tokens ? sumConversationMessageTokens(message.tokens) : undefined;
}

function readModelIdentity(
  message: ConversationMessage,
  fallbackModel?: string,
): { providerId: string; modelId: string } | null {
  if (message.providerId && message.modelId) {
    return { providerId: message.providerId, modelId: message.modelId };
  }

  // Messages stored before CC persisted the model fall back to the specialist's
  // default, which is the same `provider/model` shape.
  const slash = fallbackModel?.indexOf("/") ?? -1;
  if (!fallbackModel || slash <= 0) return null;

  return {
    providerId: fallbackModel.slice(0, slash),
    modelId: fallbackModel.slice(slash + 1),
  };
}

function readContextLimit(
  providers: Provider[],
  identity: { providerId: string; modelId: string },
): number | undefined {
  const provider = providers.find((entry) => entry.id === identity.providerId);
  const model = provider?.models[identity.modelId];
  if (!isRecord(model)) return undefined;

  const limit = model["limit"];
  if (!isRecord(limit)) return undefined;

  const context = limit["context"];
  return typeof context === "number" && Number.isFinite(context) ? context : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
