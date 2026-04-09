import { schedulerStatusSchema, type SchedulerStatus } from "@cc/shared/schemas";

export type SchedulerService = ReturnType<typeof createSchedulerService>;

export function createSchedulerService() {
  const status = schedulerStatusSchema.parse({
    state: "inactive",
    healthy: true,
    driver: "none",
  });

  return {
    getStatus(): SchedulerStatus {
      return status;
    },
  };
}
