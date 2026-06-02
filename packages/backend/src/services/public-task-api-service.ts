import type {
  PublicTaskRunStatus,
  PublicTaskTemplateSummary,
  PublicTriggerTemplateBody,
  PublicTriggerTemplateResponse,
} from "@cc/shared/schemas";

import type { TaskContextAttachmentService } from "./task-context-attachment-service.js";
import type { TaskExecutionService } from "./task-execution-service.js";
import type { TaskService } from "./task-service.js";
import { triggerTemplateRun } from "./trigger-template-run.js";

export type PublicTaskApiService = ReturnType<typeof createPublicTaskApiService>;

export type TriggerTemplateOutcome =
  | { kind: "not_found" }
  | { kind: "ok"; response: PublicTriggerTemplateResponse };

/**
 * Thin adapter over the existing task services. It exposes only public
 * operations and returns only public projections — never internal agent IDs,
 * permission profiles, rendered prompts, artifacts, or storage paths. It
 * contains no new task-execution logic: every action routes through a service
 * the internal UI already uses (triggering goes through the shared
 * {@link triggerTemplateRun} helper).
 */
export function createPublicTaskApiService(deps: {
  taskService: TaskService;
  executionService: TaskExecutionService;
  taskContextAttachmentService: TaskContextAttachmentService;
}) {
  const { taskService, executionService, taskContextAttachmentService } = deps;

  return {
    async listTriggerableTemplates(): Promise<PublicTaskTemplateSummary[]> {
      const templates = await taskService.listTemplates();

      return templates
        .filter((template) => template.enabled)
        .map((template) => ({
          id: template.id,
          title: template.title,
          description: template.description,
        }));
    },

    async triggerTemplate(
      templateId: string,
      body: PublicTriggerTemplateBody,
    ): Promise<TriggerTemplateOutcome> {
      const text = body.context?.text;
      const result = await triggerTemplateRun(
        { taskService, executionService, taskContextAttachmentService },
        {
          templateId,
          triggerSource: "api",
          context: text ? { text, attachments: [] } : undefined,
          contextAttachmentUploads: body.attachments,
          metadata: body.metadata,
          scheduledFor: body.schedule?.runAt,
        },
      );

      if (result.kind === "not_found") {
        return { kind: "not_found" };
      }

      if (result.kind === "scheduled") {
        return {
          kind: "ok",
          response: {
            taskId: result.task.id,
            runId: null,
            status: "scheduled",
            scheduledFor: body.schedule?.runAt ?? null,
          },
        };
      }

      return {
        kind: "ok",
        response: {
          taskId: result.task.id,
          runId: result.run.id,
          status: "queued",
          scheduledFor: null,
        },
      };
    },

    async getRunStatus(runId: string): Promise<PublicTaskRunStatus | undefined> {
      const run = await taskService.getRunById(runId);

      if (!run) {
        return undefined;
      }

      return {
        runId: run.id,
        taskId: run.taskId,
        status: run.status,
        outcome: run.outcome ?? null,
        finalMessage: run.finalMessage ?? null,
        startedAt: run.startedAt ?? null,
        completedAt: run.completedAt ?? null,
      };
    },
  };
}
