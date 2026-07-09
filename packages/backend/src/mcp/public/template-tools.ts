import { z } from "zod";

import {
  uploadTaskContextAttachmentInputSchema,
  type ApiTokenRecord,
  type TaskTemplate,
  type UploadTaskContextAttachmentInput,
} from "@cc/shared/schemas";

import { tokenHasCapability, tokenHasTemplate } from "../../services/api-token-service.js";
import type { TaskContextAttachmentService } from "../../services/task-context-attachment-service.js";
import type { TaskExecutionService } from "../../services/task-execution-service.js";
import type { TaskService } from "../../services/task-service.js";
import { triggerTemplateRun } from "../../services/trigger-template-run.js";
import {
  GET_TASK_RESULT_CAPABILITY,
  okResult,
  runTool,
  type RegisterableMcpTool,
} from "./registry.js";
import type { PublicMcpRunService } from "./run-service.js";

const ASYNC_NOTE =
  " Starts the run and returns immediately with its id and current status (not the final result); poll get_task_result with the returned runId for the outcome and artifacts.";

type TemplateToolArgs = {
  text?: string;
  files?: UploadTaskContextAttachmentInput[];
};

type TemplateToolDeps = {
  taskService: TaskService;
  executionService: TaskExecutionService;
  taskContextAttachmentService: TaskContextAttachmentService;
  runService: PublicMcpRunService;
};

export type PublicMcpTemplateToolBuilder = ReturnType<typeof createPublicMcpTemplateToolBuilder>;

export function createPublicMcpTemplateToolBuilder(deps: TemplateToolDeps) {
  return {
    // Build the per-template tools visible to a token: each active, MCP-exposed
    // template the token enables becomes one tool (plus an async sibling when the
    // template opts in and the token can poll results).
    async buildForToken(token: ApiTokenRecord): Promise<RegisterableMcpTool[]> {
      const templates = await deps.taskService.listTemplates();
      const canPollResults = tokenHasCapability(token, GET_TASK_RESULT_CAPABILITY);
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

        const includeAsync = template.mcpConfig.asyncEnabled && canPollResults;
        tools.push(...buildTemplateTools(template, deps, includeAsync));
      }

      return tools;
    },
  };
}

function buildTemplateTools(
  template: TaskTemplate,
  deps: TemplateToolDeps,
  includeAsync: boolean,
): RegisterableMcpTool[] {
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

  const description =
    config.toolDescription || template.description || `Run the "${template.title}" template.`;
  const fallback = `Failed to run the "${template.title}" template.`;

  // Trigger the template and return the new run id (or throw a tool error).
  async function trigger(args: unknown): Promise<string> {
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
    return outcome.run.id;
  }

  const tools: RegisterableMcpTool[] = [
    {
      name: config.toolName,
      description,
      inputSchema,
      execute: (args) =>
        runTool(async () => {
          const result = await deps.runService.waitForResult(await trigger(args));
          if (!result) {
            throw new Error("Task run not found after trigger.");
          }
          return okResult(result);
        }, fallback),
    },
  ];

  if (includeAsync) {
    tools.push({
      name: `${config.toolName}_async`,
      description: `${description}${ASYNC_NOTE}`,
      inputSchema,
      execute: (args) =>
        runTool(async () => {
          const result = await deps.runService.getResult(await trigger(args));
          if (!result) {
            throw new Error("Task run not found after trigger.");
          }
          return okResult(result);
        }, fallback),
    });
  }

  return tools;
}
