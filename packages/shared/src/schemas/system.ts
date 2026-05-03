import { z } from "zod";

export const installModeSchema = z.enum(["docker", "npm-global", "npm-local"]);

export const systemVersionSchema = z.object({
  current: z.string().min(1),
  latest: z.string().min(1).optional(),
  updateAvailable: z.boolean(),
  installMode: installModeSchema,
  autoUpdateEnabled: z.boolean(),
  autoUpdateSource: z.enum(["environment", "settings"]),
  checkedAt: z.string().datetime().optional(),
  error: z.string().min(1).optional(),
});

export const systemUpdatePreferencesSchema = z.object({
  autoUpdateEnabled: z.boolean(),
  autoUpdateSource: z.enum(["environment", "settings"]),
  environmentDefault: z.boolean(),
});

export const updateSystemUpdatePreferencesInputSchema = z.object({
  autoUpdateEnabled: z.boolean(),
});

export const systemUpdateResultSchema = z.object({
  applied: z.boolean(),
  installMode: installModeSchema,
  message: z.string().min(1),
  previousVersion: z.string().min(1).optional(),
  targetVersion: z.string().min(1).optional(),
  restartRequired: z.boolean(),
  instructions: z.array(z.string()).optional(),
});

export type InstallMode = z.infer<typeof installModeSchema>;
export type SystemVersion = z.infer<typeof systemVersionSchema>;
export type SystemUpdateResult = z.infer<typeof systemUpdateResultSchema>;
export type SystemUpdatePreferences = z.infer<typeof systemUpdatePreferencesSchema>;
export type UpdateSystemUpdatePreferencesInput = z.infer<
  typeof updateSystemUpdatePreferencesInputSchema
>;
