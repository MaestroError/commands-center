import { schedulerStatusSchema, type SchedulerStatus } from "@cc/shared/schemas";

export type SchedulerService = ReturnType<typeof createSchedulerService>;

export function createSchedulerService(options?: { delegate?: { getStatus(): SchedulerStatus } }) {
  return {
    getStatus(): SchedulerStatus {
      return (
        options?.delegate?.getStatus() ??
        schedulerStatusSchema.parse({
          state: "inactive",
          healthy: true,
          driver: "none",
        })
      );
    },
  };
}
