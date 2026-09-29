import { z } from "zod";

import { conversationMessageTokensSchema } from "./conversations.js";

/**
 * Token and cost totals for a conversation, a task run, or a whole task.
 *
 * Aggregated in SQL from the per-message columns rather than summed in the
 * browser: since conversations are paged, the client only ever holds the newest
 * window and any total it computed would silently under-report.
 */
export const usageTotalsSchema = z.object({
  /** Absent when no message in scope reported usage at all. */
  tokens: conversationMessageTokensSchema.optional(),
  /** Summed from the components; see `sumConversationMessageTokens`. */
  totalTokens: z.number().nonnegative().default(0),
  /** Absent when no provider in scope billed per request. */
  cost: z.number().nonnegative().optional(),
  /** Messages in scope. */
  messageCount: z.number().int().nonnegative().default(0),
  /** Assistant replies in scope — the only messages that can carry usage. */
  assistantMessageCount: z.number().int().nonnegative().default(0),
  /**
   * Messages that actually carried usage. Lower than `messageCount` is normal —
   * user messages never carry it, and assistant messages stored before CC
   * persisted metrics carry it only after their next sync. Zero means the total
   * is unknown rather than nought, and callers should say so.
   */
  countedMessageCount: z.number().int().nonnegative().default(0),
});

/** A task's total alongside the per-run breakdown it was summed from. */
export const taskUsageSchema = z.object({
  taskId: z.string().min(1),
  /** Every run of the task, retries and replied runs included. */
  total: usageTotalsSchema,
  runCount: z.number().int().nonnegative().default(0),
  /** Keyed by task run id. Runs with no conversation are absent. */
  runs: z.record(z.string().min(1), usageTotalsSchema).default({}),
});

export type UsageTotals = z.infer<typeof usageTotalsSchema>;
export type TaskUsage = z.infer<typeof taskUsageSchema>;

/** True when nothing in scope reported usage, so no number should be shown. */
export function isUsageUnknown(usage: UsageTotals): boolean {
  return usage.countedMessageCount === 0;
}
