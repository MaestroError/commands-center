import type { ConversationMessage, ConversationPart, Provider } from "@cc/shared/schemas";

import { readMessageUsage } from "./usage-stats";

/**
 * How much of the model's context window the conversation is using.
 *
 * "Used" is what the window holds right now: the prompt the model received on
 * the most recent real turn, plus that turn's own reply, which is already in the
 * history the next request will carry. Checked against consecutive turns in real
 * sessions, that predicts the next prompt closely.
 *
 * Summary turns are skipped. A `/compact` writes messages flagged `summary`
 * whose token counts describe the summarization request itself, not the
 * conversation — reading one would report a number far below the real context
 * in the window between compacting and the next turn. The turn after a
 * compaction reports the genuinely reduced context, so the ring falls then.
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

  const usedTokens =
    latest.tokens.input + latest.tokens.cacheRead + latest.tokens.output + latest.tokens.reasoning;
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

type LatestTokens = {
  input: number;
  cacheRead: number;
  output: number;
  reasoning: number;
};

function findLatestUsage(
  messages: ConversationMessage[],
  parts: Record<string, ConversationPart[]>,
): { message: ConversationMessage; tokens: LatestTokens } | null {
  // Newest first: only the last real turn describes the current window.
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") continue;
    // A compaction's own turns report the summarization request, not the chat.
    if (message.summary === true) continue;

    const usage = readMessageUsage(message, parts[message.id] ?? message.parts);
    if (!usage?.tokens) continue;

    return {
      message,
      tokens: {
        input: usage.tokens.input,
        cacheRead: usage.tokens.cacheRead,
        output: usage.tokens.output,
        reasoning: usage.tokens.reasoning,
      },
    };
  }

  return null;
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
