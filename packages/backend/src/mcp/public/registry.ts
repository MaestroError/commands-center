import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat";
import { z } from "zod";

import {
  listPublicTasksQuerySchema,
  mcpTaskRunResultSchema,
  publicDocumentListInputSchema,
  publicDocumentListResponseSchema,
  publicDocumentReadInputSchema,
  publicDocumentReadSchema,
  publicDocumentSearchInputSchema,
  publicDocumentSearchResponseSchema,
  publicCreateTaskBodySchema,
  type ApiTokenRecord,
  type McpTaskRunResult,
} from "@cc/shared/schemas";

import type { PublicTaskApiService } from "../../services/public-task-api-service.js";
import type { PublicDocumentApiService } from "../../services/public-document-api-service.js";
import type { PublicMcpRunService } from "./run-service.js";

export type PublicMcpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

// A tool ready to register on the MCP server. Static registry tools add a
// `capability`; dynamic per-template tools (Phase 3) are pre-filtered by the
// token's enabled templates and carry no capability.
export type RegisterableMcpTool = {
  name: string;
  description: string;
  inputSchema?: AnySchema;
  outputSchema?: AnySchema;
  execute: (args: unknown, token?: ApiTokenRecord) => Promise<PublicMcpToolResult>;
};

export type PublicMcpToolDefinition = RegisterableMcpTool & {
  /** Phase 1 capability id that gates this tool on the calling token. */
  capability: string;
  // Auto-exposed async sibling (Phase 4) — registered only when the token also
  // enables the result-polling tool (GET_TASK_RESULT_CAPABILITY).
  asyncVariant?: RegisterableMcpTool;
};

// The capability behind get_task_result. Async run variants are exposed only
// when the token grants it (so the caller can poll the returned run id).
export const GET_TASK_RESULT_CAPABILITY = "get_task_run";

const emptyInputSchema = z.object({}).strict();
const templateIdInputSchema = z.object({ templateId: z.string().trim().min(1) }).strict();
const taskIdInputSchema = z.object({ taskId: z.string().trim().min(1) }).strict();
const getTaskInputSchema = z
  .object({ taskId: z.string().trim().min(1), expand: z.string().optional() })
  .strict();
const getTaskRunInputSchema = z
  .object({ taskId: z.string().trim().min(1), runId: z.string().trim().min(1) })
  .strict();
const runIdInputSchema = z.object({ runId: z.string().trim().min(1) }).strict();
const scheduleTaskInputSchema = z
  .object({
    taskId: z.string().trim().min(1),
    runAt: z.string().datetime().nullable(),
  })
  .strict();
const templateRunInputSchema = z
  .object({
    templateId: z.string().trim().min(1),
    text: z.string().trim().min(1).optional(),
  })
  .strict();

export function createPublicMcpRegistry(deps: {
  service: PublicTaskApiService;
  runService: PublicMcpRunService;
  documentService: PublicDocumentApiService;
}): readonly PublicMcpToolDefinition[] {
  const { service, runService, documentService } = deps;

  return [
    {
      name: "list_documents",
      capability: "list_documents",
      description:
        "List document metadata across the global/private roots available to this token.",
      inputSchema: publicDocumentListInputSchema,
      outputSchema: publicDocumentListResponseSchema,
      execute: (args, token) =>
        runTool(async () => {
          const result = await documentService.listDocuments(
            requireToken(token),
            publicDocumentListInputSchema.parse(args ?? {}),
          );
          return ok(`Found ${String(result.documents.length)} document(s).`, result);
        }, "Failed to list documents."),
    },
    {
      name: "search_documents",
      capability: "search_documents",
      description:
        "Search metadata and markdown content across document roots available to this token.",
      inputSchema: publicDocumentSearchInputSchema,
      outputSchema: publicDocumentSearchResponseSchema,
      execute: (args, token) =>
        runTool(async () => {
          const result = await documentService.searchDocuments(
            requireToken(token),
            publicDocumentSearchInputSchema.parse(args),
          );
          return ok(`Found ${String(result.documents.length)} matching document(s).`, result);
        }, "Failed to search documents."),
    },
    {
      name: "read_document",
      capability: "read_document",
      description: "Read one authorized global or private markdown document by scoped identity.",
      inputSchema: publicDocumentReadInputSchema,
      outputSchema: publicDocumentReadSchema,
      execute: (args, token) =>
        runTool(async () => {
          const result = await documentService.readDocument(
            requireToken(token),
            publicDocumentReadInputSchema.parse(args),
          );
          return ok("Document found.", result);
        }, "Failed to read document."),
    },
    {
      name: "list_task_templates",
      capability: "list_task_templates",
      description: "List task templates available to trigger (enabled templates only).",
      inputSchema: emptyInputSchema,
      execute: () =>
        runTool(async () => {
          const templates = await service.listTriggerableTemplates();
          return ok(`Found ${String(templates.length)} template(s).`, { templates });
        }, "Failed to list task templates."),
    },
    {
      name: "list_specialists",
      capability: "list_specialists",
      description: "List specialists so a task can target one.",
      inputSchema: emptyInputSchema,
      execute: () =>
        runTool(async () => {
          const specialists = await service.listAgents();
          return ok(`Found ${String(specialists.length)} specialist(s).`, { specialists });
        }, "Failed to list specialists."),
    },
    {
      name: "list_tasks",
      capability: "list_tasks",
      description: "List workspace tasks, optionally filtered by status, specialist, or template.",
      inputSchema: listPublicTasksQuerySchema,
      execute: (args) =>
        runTool(async () => {
          const query = listPublicTasksQuerySchema.parse(args ?? {});
          const tasks = await service.listTasks(query);
          return ok(`Found ${String(tasks.length)} task(s).`, { tasks });
        }, "Failed to list tasks."),
    },
    {
      name: "get_task",
      capability: "get_task",
      description: "Get a single task. Set expand to 'runs,feedback' to embed them.",
      inputSchema: getTaskInputSchema,
      execute: (args) =>
        runTool(async () => {
          const { taskId, expand } = getTaskInputSchema.parse(args);
          const task = await service.getTask(taskId, parseExpand(expand));
          if (!task) {
            throw new Error("Task not found.");
          }
          return ok("Task found.", { task });
        }, "Failed to get task."),
    },
    {
      name: "list_task_runs",
      capability: "list_task_runs",
      description: "List the runs of a task.",
      inputSchema: taskIdInputSchema,
      execute: (args) =>
        runTool(async () => {
          const { taskId } = taskIdInputSchema.parse(args);
          const runs = await service.listRuns(taskId);
          if (!runs) {
            throw new Error("Task not found.");
          }
          return ok(`Found ${String(runs.length)} run(s).`, { runs });
        }, "Failed to list task runs."),
    },
    {
      name: "get_task_run",
      capability: "get_task_run_detail",
      description: "Get a single run of a task.",
      inputSchema: getTaskRunInputSchema,
      execute: (args) =>
        runTool(async () => {
          const { taskId, runId } = getTaskRunInputSchema.parse(args);
          const taskRun = await service.getRun(taskId, runId);
          if (!taskRun) {
            throw new Error("Task run not found.");
          }
          return ok("Task run found.", { run: taskRun });
        }, "Failed to get task run."),
    },
    {
      name: "get_task_result",
      capability: "get_task_run",
      description:
        "Get the result of a run by id: status, result text, and artifacts once it completes. Poll this after an async run.",
      inputSchema: runIdInputSchema,
      outputSchema: mcpTaskRunResultSchema,
      execute: (args) =>
        runTool(async () => {
          const { runId } = runIdInputSchema.parse(args);
          const result = await runService.getResult(runId);
          if (!result) {
            throw new Error("Task run not found.");
          }
          return okResult(result);
        }, "Failed to get task result."),
    },
    {
      name: "list_task_feedback",
      capability: "list_task_feedback",
      description: "Read a task's feedback threads and subtask replies.",
      inputSchema: taskIdInputSchema,
      execute: (args) =>
        runTool(async () => {
          const { taskId } = taskIdInputSchema.parse(args);
          const feedback = await service.listFeedback(taskId);
          if (!feedback) {
            throw new Error("Task not found.");
          }
          return ok(`Found ${String(feedback.length)} feedback thread(s).`, { feedback });
        }, "Failed to list task feedback."),
    },
    {
      name: "enable_task_template",
      capability: "enable_task_template",
      description: "Activate a task template so it runs on schedule and accepts triggers.",
      inputSchema: templateIdInputSchema,
      execute: (args) =>
        runTool(async () => {
          const { templateId } = templateIdInputSchema.parse(args);
          const template = await service.setTemplateEnabled(templateId, true);
          if (!template) {
            throw new Error("Task template not found.");
          }
          return ok("Template enabled.", { template });
        }, "Failed to enable task template."),
    },
    {
      name: "disable_task_template",
      capability: "disable_task_template",
      description: "Deactivate a task template without changing its schedule.",
      inputSchema: templateIdInputSchema,
      execute: (args) =>
        runTool(async () => {
          const { templateId } = templateIdInputSchema.parse(args);
          const template = await service.setTemplateEnabled(templateId, false);
          if (!template) {
            throw new Error("Task template not found.");
          }
          return ok("Template disabled.", { template });
        }, "Failed to disable task template."),
    },
    {
      name: "create_task",
      capability: "create_task",
      description: "Create a task against a specialist.",
      inputSchema: publicCreateTaskBodySchema,
      execute: (args) =>
        runTool(async () => {
          const body = publicCreateTaskBodySchema.parse(args);
          const task = await service.createTask(body);
          return ok("Task created.", { task });
        }, "Failed to create task."),
    },
    {
      name: "schedule_task",
      capability: "schedule_task",
      description:
        "Schedule or reschedule a task for a future time. Send runAt: null to unschedule.",
      inputSchema: scheduleTaskInputSchema,
      execute: (args) =>
        runTool(async () => {
          const { taskId, runAt } = scheduleTaskInputSchema.parse(args);
          const task = await service.scheduleTask(taskId, { runAt });
          if (!task) {
            throw new Error("Task not found.");
          }
          return ok("Task scheduled.", { task });
        }, "Failed to schedule task."),
    },
    {
      name: "task_template_run",
      capability: "trigger_task_template",
      description:
        "Trigger a task template and wait for the run to finish, returning its result and artifacts.",
      inputSchema: templateRunInputSchema,
      outputSchema: mcpTaskRunResultSchema,
      execute: (args) =>
        runTool(
          async () =>
            okResult((await runService.waitForResult(await triggerTemplate(args))) ?? missingRun()),
          "Failed to run task template.",
        ),
      asyncVariant: {
        name: "task_template_run_async",
        description: `Trigger a task template without waiting.${ASYNC_NOTE}`,
        inputSchema: templateRunInputSchema,
        execute: (args) =>
          runTool(
            async () => queuedResult(await triggerTemplate(args)),
            "Failed to run task template.",
          ),
      },
    },
    {
      name: "task_run",
      capability: "trigger_task",
      description: "Run a task now and wait for it to finish, returning its result and artifacts.",
      inputSchema: taskIdInputSchema,
      outputSchema: mcpTaskRunResultSchema,
      execute: (args) =>
        runTool(
          async () =>
            okResult((await runService.waitForResult(await triggerTask(args))) ?? missingRun()),
          "Failed to run task.",
        ),
      asyncVariant: {
        name: "task_run_async",
        description: `Run a task now without waiting.${ASYNC_NOTE}`,
        inputSchema: taskIdInputSchema,
        execute: (args) =>
          runTool(async () => queuedResult(await triggerTask(args)), "Failed to run task."),
      },
    },
  ];

  // Trigger a template run and return its runId, or throw a tool error.
  async function triggerTemplate(args: unknown): Promise<string> {
    const { templateId, text } = templateRunInputSchema.parse(args);
    const outcome = await service.triggerTemplate(templateId, {
      context: text ? { text } : undefined,
    });
    if (outcome.kind === "not_found") {
      throw new Error("Task template not found.");
    }
    if (!outcome.response.runId) {
      throw new Error("Template did not start a run.");
    }
    return outcome.response.runId;
  }

  async function triggerTask(args: unknown): Promise<string> {
    const { taskId } = taskIdInputSchema.parse(args);
    const response = await service.triggerTask(taskId, {});
    if (!response) {
      throw new Error("Task not found.");
    }
    return response.runId;
  }

  // Immediate id-return for the async variants: read the queued run once so the
  // shape matches the sync result (timedOut=true), without waiting for it.
  async function queuedResult(runId: string): Promise<PublicMcpToolResult> {
    const result = await runService.getResult(runId);
    return okResult(result ?? missingRun());
  }
}

function requireToken(token: ApiTokenRecord | undefined): ApiTokenRecord {
  if (!token) {
    throw new Error("API token is required.");
  }
  return token;
}

const ASYNC_NOTE =
  " Starts the run and returns immediately with its id and current status (not the final result); poll get_task_result with the returned runId for the outcome and artifacts.";

function missingRun(): never {
  throw new Error("Task run not found after trigger.");
}

function parseExpand(expand: string | undefined): Set<string> {
  return new Set(
    (expand ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

export async function runTool(
  action: () => Promise<PublicMcpToolResult>,
  fallbackMessage: string,
): Promise<PublicMcpToolResult> {
  try {
    return await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : fallbackMessage;
    return {
      isError: true,
      structuredContent: { error: { message } },
      content: [{ type: "text", text: message }],
    };
  }
}

function ok(message: string, structuredContent: Record<string, unknown>): PublicMcpToolResult {
  return {
    structuredContent,
    content: [
      { type: "text", text: `${message}\n\n${JSON.stringify(structuredContent, null, 2)}` },
    ],
  };
}

// Run-result tools carry an output schema, so their structuredContent must be the
// bare result object (not wrapped) to satisfy MCP structured validation.
export function okResult(result: McpTaskRunResult): PublicMcpToolResult {
  return {
    structuredContent: result,
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
