import { z } from "zod";

import {
  uploadTaskContextAttachmentInputSchema,
  type ApiTokenRecord,
  type TaskTemplate,
  type UploadTaskContextAttachmentInput,
} from "@cc/shared/schemas";

import { tokenHasTemplate } from "../../services/api-token-service.js";
import type { TaskContextAttachmentService } from "../../services/task-context-attachment-service.js";
import type { TaskExecutionService } from "../../services/task-execution-service.js";
import type { TaskService } from "../../services/task-service.js";
import { triggerTemplateRun } from "../../services/trigger-template-run.js";
import { okResult, runTool, type RegisterableMcpTool } from "./registry.js";
import type { PublicMcpRunService } from "./run-service.js";

type TemplateToolArgs = {
  text?: string;
  files?: UploadTaskContextAttachmentInput[];
};

export type PublicMcpTemplateToolBuilder = ReturnType<typeof createPublicMcpTemplateToolBuilder>;

export function createPublicMcpTemplateToolBuilder(deps: {
  taskService: TaskService;
  executionService: TaskExecutionService;
  taskContextAttachmentService: TaskContextAttachmentService;
  runService: PublicMcpRunService;
}) {
  return {
    // Build the per-template tools visible to a token: each active, MCP-exposed
    // template the token enables becomes one tool.
    async buildForToken(token: ApiTokenRecord): Promise<RegisterableMcpTool[]> {
      const templates = await deps.taskService.listTemplates();
      const tools: RegisterableMcpTool[] = [];
      const seen = new Set<string>();

      for (const template of templates) {
        if (
          !template.enabled ||
          !template.mcpConfig.exposeAsTool ||
          !tokenHasTemplate(token, template.id)
        ) {
          continue;
        }

        // Defend the session against an accidental dupe name (save-time
        // validation should prevent it) so one bad row can't break tools/list.
        if (seen.has(template.mcpConfig.toolName)) {
          continue;
        }
        seen.add(template.mcpConfig.toolName);

        tools.push(buildTemplateTool(template, deps));
      }

      return tools;
    },
  };
}

function buildTemplateTool(
  template: TaskTemplate,
  deps: {
    taskService: TaskService;
    executionService: TaskExecutionService;
    taskContextAttachmentService: TaskContextAttachmentService;
    runService: PublicMcpRunService;
  },
): RegisterableMcpTool {
  const config = template.mcpConfig;
  const textField = z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(config.textFieldDescription || "Text context for this run.");
  const inputSchema = config.allowFiles
    ? z
        .object({
          text: textField,
          files: z
            .array(uploadTaskContextAttachmentInputSchema)
            .optional()
            .describe(config.filesFieldDescription || "Files to attach to this run."),
        })
        .strict()
    : z.object({ text: textField }).strict();

  return {
    name: config.toolName,
    description:
      config.toolDescription || template.description || `Run the "${template.title}" template.`,
    inputSchema,
    execute: (args) =>
      runTool(async () => {
        const parsed = inputSchema.parse(args ?? {}) as TemplateToolArgs;
        const outcome = await triggerTemplateRun(
          {
            taskService: deps.taskService,
            executionService: deps.executionService,
            taskContextAttachmentService: deps.taskContextAttachmentService,
          },
          {
            templateId: template.id,
            triggerSource: "api",
            context: parsed.text ? { text: parsed.text, attachments: [] } : undefined,
            contextAttachmentUploads: parsed.files,
          },
        );

        if (outcome.kind === "not_found") {
          throw new Error("Task template not found.");
        }
        if (outcome.kind !== "queued") {
          throw new Error("Template did not start a run.");
        }

        const result = await deps.runService.waitForResult(outcome.run.id);
        if (!result) {
          throw new Error("Task run not found after trigger.");
        }
        return okResult(result);
      }, `Failed to run the "${template.title}" template.`),
  };
}
