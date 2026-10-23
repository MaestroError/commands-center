import { readFile } from "node:fs/promises";
import { eq, isNull } from "drizzle-orm";
import {
  specialistCapabilitySelectionSchema,
  taskPermissionProfileSchema,
  type TaskPermissionProfile,
} from "@cc/shared/schemas";
import type { AppDb } from "../db/client.js";
import { tasks, task_templates, mcp_servers } from "../db/schema/index.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { writeConfigFileAtomic } from "../lib/config-file.js";
import { renameMcpReferences } from "./specialist-capability-sync.js";
import { templateFilePath, taskTemplateFileSchema } from "./task-service/template-files.js";

export async function renameTaskMcpReferences(
  db: AppDb,
  config: RuntimeConfig,
  previousName: string,
  nextName: string,
): Promise<void> {
  const configuredNames = (await db.select({ name: mcp_servers.name }).from(mcp_servers)).map(
    (server) => server.name,
  );
  function rename(profile: TaskPermissionProfile): TaskPermissionProfile {
    const renamed = renameMcpReferences(
      specialistCapabilitySelectionSchema.parse(profile),
      previousName,
      nextName,
      configuredNames,
    );
    return taskPermissionProfileSchema.parse({
      ...profile,
      mcpServers: profile.mcpServers === undefined ? undefined : renamed.mcpServers,
      toolPermissions: profile.toolPermissions === undefined ? undefined : renamed.toolPermissions,
      mcpToolPermissions:
        profile.mcpToolPermissions === undefined ? undefined : renamed.mcpToolPermissions,
    });
  }
  const timestamp = new Date();
  for (const template of await db
    .select()
    .from(task_templates)
    .where(isNull(task_templates.deleted_at))) {
    const path = templateFilePath(config, template.id);
    const content = taskTemplateFileSchema.parse(JSON.parse(await readFile(path, "utf8")));
    if (!content.permissionProfile) continue;
    const profile = rename(content.permissionProfile);
    if (JSON.stringify(profile) !== JSON.stringify(content.permissionProfile))
      await writeConfigFileAtomic(path, {
        ...content,
        permissionProfile: profile,
        updatedAt: timestamp.toISOString(),
      });
    if (template.permission_profile_json === JSON.stringify(profile)) continue;
    await db
      .update(task_templates)
      .set({ permission_profile_json: JSON.stringify(profile), updated_at: timestamp })
      .where(eq(task_templates.id, template.id));
  }
  for (const task of await db.select().from(tasks).where(isNull(tasks.deleted_at))) {
    if (!task.permission_profile_json) continue;
    const current = taskPermissionProfileSchema.parse(JSON.parse(task.permission_profile_json));
    const profile = rename(current);
    if (JSON.stringify(current) === JSON.stringify(profile)) continue;
    await db
      .update(tasks)
      .set({ permission_profile_json: JSON.stringify(profile), updated_at: timestamp })
      .where(eq(tasks.id, task.id));
  }
}
