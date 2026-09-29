import { and, eq, isNotNull, sql } from "drizzle-orm";

import {
  taskUsageSchema,
  usageTotalsSchema,
  type TaskUsage,
  type UsageTotals,
} from "@cc/shared/schemas";

import type { AppDb } from "../db/client.js";
import { conversations, messages } from "../db/schema/index.js";

/**
 * Token and cost totals, aggregated in SQL over the per-message columns.
 *
 * These are read-time queries rather than denormalized counters. Messages are
 * the single source of truth, and they are deleted and reinserted on every
 * OpenCode sync — a stored counter would need recomputing after each one, and
 * would drift the moment that was missed. A covering index keeps the scan off
 * the row bodies, so the cost does not grow with the size of `parts_json`.
 */

/** The aggregate columns every scope selects. */
const USAGE_COLUMNS = {
  input: sql<number | null>`sum(${messages.tokens_input})`,
  output: sql<number | null>`sum(${messages.tokens_output})`,
  reasoning: sql<number | null>`sum(${messages.tokens_reasoning})`,
  cacheRead: sql<number | null>`sum(${messages.tokens_cache_read})`,
  cacheWrite: sql<number | null>`sum(${messages.tokens_cache_write})`,
  cost: sql<number | null>`sum(${messages.cost})`,
  // count(id) not count(*): a left-joined conversation with no messages
  // produces one all-null row, which count(*) would score as a message.
  messageCount: sql<number>`count(${messages.id})`,
  assistantMessageCount: sql<number>`sum(case when ${messages.role} = 'assistant' then 1 else 0 end)`,
  countedMessageCount: sql<number>`count(${messages.tokens_input})`,
};

type UsageRow = {
  input: number | null;
  output: number | null;
  reasoning: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  cost: number | null;
  messageCount: number;
  assistantMessageCount: number | null;
  countedMessageCount: number;
};

export function createUsageService(options: { db: AppDb }) {
  return {
    /** Totals for one conversation — a chat, or a single task run's session. */
    async getConversationUsage(conversationId: string): Promise<UsageTotals> {
      const [row] = await options.db
        .select(USAGE_COLUMNS)
        .from(messages)
        .where(eq(messages.conversation_id, conversationId));

      return toUsageTotals(row);
    },

    /**
     * A task's total and its per-run breakdown, in one grouped query.
     *
     * Every run counts, including retries and runs that were replied to: a
     * reply continues its run's own conversation, so its extra tokens land in
     * that run's total rather than appearing as a new run.
     */
    async getTaskUsage(taskId: string): Promise<TaskUsage> {
      // Driven from conversations, not messages: a run whose session exists but
      // has no messages yet must still appear, with a zero count. Starting from
      // messages would drop it from both `runs` and `runCount`.
      const rows = await options.db
        .select({ taskRunId: conversations.task_run_id, ...USAGE_COLUMNS })
        .from(conversations)
        .leftJoin(messages, eq(messages.conversation_id, conversations.id))
        .where(and(eq(conversations.task_id, taskId), isNotNull(conversations.task_run_id)))
        .groupBy(conversations.task_run_id);

      const runs: Record<string, UsageTotals> = {};
      const total: UsageRow = {
        input: null,
        output: null,
        reasoning: null,
        cacheRead: null,
        cacheWrite: null,
        cost: null,
        messageCount: 0,
        assistantMessageCount: 0,
        countedMessageCount: 0,
      };

      for (const row of rows) {
        if (!row.taskRunId) continue;

        runs[row.taskRunId] = toUsageTotals(row);
        total.input = addNullable(total.input, row.input);
        total.output = addNullable(total.output, row.output);
        total.reasoning = addNullable(total.reasoning, row.reasoning);
        total.cacheRead = addNullable(total.cacheRead, row.cacheRead);
        total.cacheWrite = addNullable(total.cacheWrite, row.cacheWrite);
        total.cost = addNullable(total.cost, row.cost);
        total.messageCount += row.messageCount;
        total.assistantMessageCount =
          (total.assistantMessageCount ?? 0) + (row.assistantMessageCount ?? 0);
        total.countedMessageCount += row.countedMessageCount;
      }

      return taskUsageSchema.parse({
        taskId,
        total: toUsageTotals(total),
        runCount: Object.keys(runs).length,
        runs,
      });
    },
  };
}

export type UsageService = ReturnType<typeof createUsageService>;

function toUsageTotals(row: UsageRow | undefined): UsageTotals {
  if (!row) {
    return usageTotalsSchema.parse({});
  }

  const tokens = {
    input: row.input ?? 0,
    output: row.output ?? 0,
    reasoning: row.reasoning ?? 0,
    cacheRead: row.cacheRead ?? 0,
    cacheWrite: row.cacheWrite ?? 0,
  };
  const totalTokens =
    tokens.input + tokens.output + tokens.reasoning + tokens.cacheRead + tokens.cacheWrite;

  return usageTotalsSchema.parse({
    // Nothing counted means unknown, not zero — leave the tokens off entirely so
    // the UI can say so rather than render a confident 0.
    ...(row.countedMessageCount > 0 ? { tokens, totalTokens } : { totalTokens: 0 }),
    // A summed 0 means no provider in scope billed per request.
    ...(row.cost !== null && row.cost > 0 ? { cost: row.cost } : {}),
    messageCount: row.messageCount,
    assistantMessageCount: row.assistantMessageCount ?? 0,
    countedMessageCount: row.countedMessageCount,
  });
}

/** SUM over an all-null group is null; treat that as "nothing to add". */
function addNullable(left: number | null, right: number | null): number | null {
  if (right === null) return left;
  return (left ?? 0) + right;
}
