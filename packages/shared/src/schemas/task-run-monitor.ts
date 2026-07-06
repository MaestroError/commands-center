import { z } from "zod";

/**
 * Operator-tunable timeouts for the async task-run monitor.
 *
 * - `taskRunMonitorMaxLifetimeMinutes`: hard cap on how long a single run may stay
 *   `running` before the monitor force-fails it (`stage: "monitor_timeout"`).
 * - `taskRunMonitorNoProgressTimeoutMinutes`: how long the OpenCode session may
 *   produce no new messages before the monitor cancels the run as stalled. `0`
 *   disables stall detection.
 * - `taskRunMonitorUsageLimitFailFastMinutes`: how long a sustained provider
 *   `retry` status (e.g. a rate/usage limit) may persist before the monitor
 *   finalizes the run as `UsageLimitReached` instead of waiting for the much
 *   larger stall timeout. `0` disables fail-fast detection (falls back to the
 *   stall timeout).
 * - `taskRunMonitorRequeueAfterStall`: when a run is cancelled by the stall
 *   timeout, automatically queue a fresh run of the same task/subtask.
 * - `taskRunMonitorRequeueLimit`: max number of automatic stall requeues per task
 *   chain before it stops requeuing (only used when requeue is enabled).
 * - `taskRunMaxAutoRetries`: max number of automatic re-queues per task/subtask
 *   chain after a system error/failure before the chain stops and the task settles
 *   in the `failed` status. Acts as a global safety net against runaway retry loops.
 *   Human-review hand-offs are terminal and never auto-retry regardless of this value.
 */
export const taskRunMonitorSettingsSchema = z.object({
  taskRunMonitorMaxLifetimeMinutes: z.number().int().positive().default(360),
  taskRunMonitorNoProgressTimeoutMinutes: z.number().int().nonnegative().default(30),
  taskRunMonitorUsageLimitFailFastMinutes: z.number().int().nonnegative().default(2),
  taskRunMonitorRequeueAfterStall: z.boolean().default(false),
  taskRunMonitorRequeueLimit: z.number().int().positive().default(10),
  taskRunMaxAutoRetries: z.number().int().positive().default(10),
});

export type TaskRunMonitorSettings = z.infer<typeof taskRunMonitorSettingsSchema>;
