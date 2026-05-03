import { z } from "zod";

export const engineStateSchema = z.enum([
  "stopped",
  "starting",
  "healthy",
  "unhealthy",
  "stopping",
]);

export const engineStatusSchema = z.object({
  state: engineStateSchema,
  healthy: z.boolean(),
  url: z.string().min(1),
  workspaceDir: z.string().min(1),
  pid: z.number().int().positive().optional(),
  binaryPath: z.string().min(1).optional(),
  binarySource: z.enum(["dependency", "override"]).optional(),
  startedAt: z.string().datetime().optional(),
  lastHealthCheckAt: z.string().datetime().optional(),
  lastHealthyAt: z.string().datetime().optional(),
  lastExitCode: z.number().int().optional(),
  lastExitSignal: z.string().min(1).optional(),
  lastError: z.string().min(1).optional(),
  restartCount: z.number().int().min(0),
  maxRestarts: z.number().int().min(0),
});

export const databaseStatusSchema = z.object({
  dialect: z.literal("sqlite"),
  sqlitePath: z.string().min(1),
});

export const schedulerStatusSchema = z.object({
  state: z.enum(["inactive", "starting", "running", "stopping", "error"]),
  healthy: z.boolean(),
  driver: z.enum(["none", "local", "bree", "pg-boss"]),
  lastError: z.string().min(1).optional(),
});

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  workspaceDir: z.string().min(1),
  database: databaseStatusSchema,
  opencode: engineStatusSchema,
  scheduler: schedulerStatusSchema,
});

export type DatabaseStatus = z.infer<typeof databaseStatusSchema>;
export type EngineState = z.infer<typeof engineStateSchema>;
export type EngineStatus = z.infer<typeof engineStatusSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type SchedulerStatus = z.infer<typeof schedulerStatusSchema>;
