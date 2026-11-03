// Pure subtask/status helpers split out of task-execution-service.ts (issue #99).

import type { QueueTaskInput } from "@cc/shared/schemas";

export function readScheduledAtFromTrigger(trigger: QueueTaskInput): string | undefined {
  const scheduledAt = trigger.metadata?.["scheduledAt"];
  return typeof scheduledAt === "string" ? scheduledAt : undefined;
}
