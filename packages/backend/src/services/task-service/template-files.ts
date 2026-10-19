// Task-template folder persistence and the
// boot reconciler, split out of task-service.ts (issue #99).

import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  fallbackModelsSchema,
  recurringTaskScheduleSchema,
  taskPermissionProfileSchema,
  taskTemplateMcpConfigSchema,
  taskTodoSchema,
  type TaskTemplate,
} from "@cc/shared/schemas";
import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { now } from "../../db/ids.js";
import { task_templates } from "../../db/schema/index.js";
import { writeConfigFileAtomic } from "../../lib/config-file.js";
import type { RuntimeConfig } from "../../lib/runtime-config.js";
import type { WorkspaceReconciler } from "../../lib/workspace-reconciler.js";
import { templatePromptPath } from "./template-prompt.js";
import { computeNextRecurringRun } from "../task-scheduler-service.js";

export const legacyTaskTemplateFileSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  defaultAgentId: z.string(),
  model: z.string().nullable().optional(),
  fallbackModels: fallbackModelsSchema,
  title: z.string(),
  description: z.string(),
  todos: z.array(taskTodoSchema),
  recurrence: recurringTaskScheduleSchema.nullable(),
  permissionProfile: taskPermissionProfileSchema.nullable(),
  // Nullable for back-compat: templates authored before the MCP-config model
  // resolve to a title-derived default at read time.
  mcpConfig: taskTemplateMcpConfigSchema.nullable().optional(),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const taskTemplateFileSchema = legacyTaskTemplateFileSchema
  .omit({ description: true })
  .extend({
    version: z.literal(2),
    promptPath: z.string(),
  });

export type TemplateFileContent = z.infer<typeof taskTemplateFileSchema>;

export function templateFilePath(config: RuntimeConfig, id: string): string {
  return resolve(config.paths.subdirectories.configuration, "task-templates", id, "task.json");
}

export async function writeTemplateFile(
  config: RuntimeConfig,
  content: Omit<TemplateFileContent, "version" | "promptPath">,
  initialPrompt?: string,
): Promise<void> {
  const promptPath = relative(config.paths.workspaceDir, templatePromptPath(config, content.id))
    .split("\\")
    .join("/");
  const settings = { version: 2, ...content, promptPath };
  const path = templateFilePath(config, content.id);
  if (initialPrompt === undefined) {
    await writeConfigFileAtomic(path, settings);
    return;
  }
  const root = dirname(dirname(path));
  await mkdir(root, { recursive: true });
  const staging = await mkdtemp(resolve(root, ".template-create-"));
  try {
    await writeFile(resolve(staging, "task.md"), initialPrompt, "utf8");
    await writeConfigFileAtomic(resolve(staging, "task.json"), settings);
    await rename(staging, dirname(path));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function deleteTemplateFile(config: RuntimeConfig, id: string): Promise<void> {
  await rm(resolve(config.paths.subdirectories.configuration, "task-templates", id), {
    recursive: true,
    force: true,
  });
}

// ---------------------------------------------------------------------------
// Task template boot reconciler
// ---------------------------------------------------------------------------

export const taskTemplateReconciler: WorkspaceReconciler = {
  name: "task-templates",

  async reconcile({ config, db, logger }) {
    const dir = resolve(config.paths.subdirectories.configuration, "task-templates");

    let filenames: string[];
    try {
      filenames = (await readdir(dir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }

    const fileIds = new Set<string>();

    for (const filename of filenames) {
      const path = resolve(dir, filename, "task.json");
      fileIds.add(filename);
      let data: z.infer<typeof taskTemplateFileSchema>;
      try {
        data = taskTemplateFileSchema.parse(JSON.parse(await readFile(path, "utf8")));
        const expectedPath = relative(
          config.paths.workspaceDir,
          templatePromptPath(config, filename),
        )
          .split("\\")
          .join("/");
        if (data.id !== filename || data.promptPath !== expectedPath) {
          throw new Error(`Invalid task template identity or promptPath in ${path}`);
        }
      } catch (error) {
        logger.warn(
          { err: error, path, templateId: filename },
          "Skipping invalid task template settings",
        );
        continue;
      }

      const enabled = data.enabled;
      const recurrence = data.recurrence;
      const timestamp = now();
      const payload = {
        agent_id: data.defaultAgentId,
        default_agent_id: data.defaultAgentId,
        model: data.model ?? null,
        fallback_models: JSON.stringify(data.fallbackModels),
        title: data.title,
        prompt_path: templatePromptPath(config, data.id),
        todos_json: JSON.stringify(data.todos),
        status: enabled ? ("enabled" as const) : ("disabled" as const),
        recurrence_json: recurrence ? JSON.stringify(recurrence) : null,
        permission_profile_json: data.permissionProfile
          ? JSON.stringify(data.permissionProfile)
          : null,
        mcp_config_json: data.mcpConfig ? JSON.stringify(data.mcpConfig) : null,
        enabled,
        archived: false,
        next_occurrence_at: readTemplateNextOccurrenceAt(recurrence, enabled, timestamp),
        updated_at: new Date(data.updatedAt),
      };

      const existing = await db.query.task_templates.findFirst({
        where: (t, { eq }) => eq(t.id, data.id),
      });

      if (existing) {
        await db.update(task_templates).set(payload).where(eq(task_templates.id, data.id));
      } else {
        await db.insert(task_templates).values({
          id: data.id,
          ...payload,
          latest_final_message: null,
          latest_task_id: null,
          last_generated_occurrence_at: null,
          created_at: new Date(data.createdAt),
          archived_at: null,
          deleted_at: null,
        });
      }
    }

    // Delete DB rows with no corresponding file (orphans and soft-deleted rows
    // whose files were already removed).
    const rows = await db
      .select({ id: task_templates.id })
      .from(task_templates)
      .where(isNull(task_templates.deleted_at));

    for (const row of rows) {
      if (!fileIds.has(row.id)) {
        await db.delete(task_templates).where(eq(task_templates.id, row.id));
      }
    }
  },
};

export function readTemplateNextOccurrenceAt(
  recurrence: TaskTemplate["recurrence"] | null | undefined,
  enabled: boolean,
  timestamp: Date,
): Date | null {
  if (!recurrence) {
    return null;
  }

  return enabled
    ? computeNextRecurringRun(recurrence, timestamp, timestamp)
    : new Date(recurrence.anchorAt);
}
