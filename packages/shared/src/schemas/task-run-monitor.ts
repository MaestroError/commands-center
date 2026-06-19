import { z } from "zod";

/**
 * Operator-tunable timeouts for the async task-run monitor.
 *
 * - `taskRunMonitorMaxLifetimeMinutes`: hard cap on how long a single run may stay
 *   `running` before the monitor force-fails it (`stage: "monitor_timeout"`).
 * - `taskRunMonitorNoProgressTimeoutMinutes`: how long the OpenCode session may
 *   produce no new messages before the monitor cancels the run as stalled. `0`
 *   disables stall detection.
 * - `taskRunMonitorRequeueAfterStall`: when a run is cancelled by the stall
 *   timeout, automatically queue a fresh run of the same task/subtask.
 */
export const taskRunMonitorSettingsSchema = z.object({
  taskRunMonitorMaxLifetimeMinutes: z.number().int().positive().default(360),
  taskRunMonitorNoProgressTimeoutMinutes: z.number().int().nonnegative().default(30),
  taskRunMonitorRequeueAfterStall: z.boolean().default(false),
});

export type TaskRunMonitorSettings = z.infer<typeof taskRunMonitorSettingsSchema>;
