import { z } from "zod";

import {
  createTaskInputSchema,
  createTaskTemplateInputSchema,
  taskContextSchema,
  taskRunSchema,
  taskSchema,
  taskTemplateSchema,
  updateTaskInputSchema,
} from "@cc/shared/schemas";

import type { AppDb } from "../../../../../db/client.js";
import type { RuntimeConfig } from "../../../../../lib/runtime-config.js";
import type { ConversationService } from "../../../../../services/conversation-service.js";
import type { LiveRequestService } from "../../../../../services/live-request-service.js";
import type { TaskExecutionService } from "../../../../../services/task-execution-service.js";
import type { TaskService } from "../../../../../services/task-service.js";
import type { Task, TaskRun } from "@cc/shared/schemas";
import {
  requireSelfTemplate,
  updateSelfTaskTemplateInputSchema,
} from "./self-task-template-tools.js";
import {
  withTaskBoardUrl,
  withTaskRunBoardUrl,
  withTaskTemplateBoardUrl,
} from "../../../task-board-urls.js";

type SelfTaskLiveToolOptions = {
  db: AppDb;
  config: RuntimeConfig;
  taskService: TaskService;
  taskExecutionService: TaskExecutionService;
  conversationService?: ConversationService;
  liveRequestService?: LiveRequestService;
};

// Terminal run statuses — polling stops when any of these is observed.
const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);
// How often to re-check the run status. 3 s is gentle on the DB; the
// 10-min cc_default_interactive timeout gives ample room to wait.
const RUN_POLL_INTERVAL_MS = 3_000;

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

// Self draft schemas never expose agentId or defaultAgentId. .strict() turns
// any attempt to pass them into an explicit validation error.
const draftSelfTaskInputSchema = createTaskInputSchema
  .omit({ agentId: true, defaultAgentId: true })
  .partial()
  .strict();

// Partial input that pre-fills the operator review form for template creation.
// defaultAgentId is omitted and always forced to the calling specialist.
const draftSelfTaskTemplateInputSchema = createTaskTemplateInputSchema
  .omit({ defaultAgentId: true })
  .partial()
  .strict();

const draftSelfTaskTemplateUpdateInputSchema = z
  .object({
    templateId: z.string().trim().min(1),
    input: updateSelfTaskTemplateInputSchema.optional(),
  })
  .strict();

const runSelfTaskInputSchema = z.object({
  taskId: z.string().trim().min(1),
  // Optional metadata attached to the run trigger for observability.
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const draftSelfTaskUpdateInputSchema = z
  .object({
    taskId: z.string().trim().min(1),
    input: updateTaskInputSchema.omit({ agentId: true, defaultAgentId: true }).optional(),
  })
  .strict();

const reviewDecisionSchema = z.object({
  action: z.literal("submit"),
  values: z.record(z.string(), z.string()),
});

const mcpTaskSchema = taskSchema.extend({
  url: z.string().url(),
});

const mcpTaskRunSchema = taskRunSchema.extend({
  taskUrl: z.string().url(),
});

const mcpTaskTemplateSchema = taskTemplateSchema.extend({
  url: z.string().url(),
});

export const draftSelfTaskToolMetadata = {
  name: "draft_self_task",
  description:
    "Open an operator review form to create a new CommandsCenter task assigned specifically to you, the calling specialist. Execution pauses until the operator approves. Use this only in chat, only when you need to schedule a new task for yourself and require the operator to review and confirm the details before the task is created. Do not call this for tasks intended for other specialists.",
  context: "chat",
} as const;

export const draftSelfTaskUpdateToolMetadata = {
  name: "draft_self_task_update",
  description:
    "Open an operator review form to edit one of your own CommandsCenter tasks. Execution pauses until the operator reviews and confirms the proposed changes. Use this only in chat, only when you want to modify a task that is assigned to you and need the operator to approve before the change is saved. Will fail if the specified task belongs to a different specialist. Do not call this to update another specialist's task.",
  context: "chat",
} as const;

export const draftSelfTaskTemplateToolMetadata = {
  name: "draft_self_task_template",
  description:
    "Open an operator review form to create a reusable CommandsCenter task template assigned to you. A template captures a task title, description, and acceptance criteria, and can optionally carry a recurrence schedule to act as a cron job that runs on a fixed interval. Use `todos` to propose acceptance criteria (the operator's definition of done): each is shown to the running agent as a criterion to satisfy, but only the operator can check them off during review. Execution pauses until the operator approves. Use this only in chat, only when you want to set up a persistent, reusable task definition for yourself and need operator review before creation. Do not attempt to pass a defaultAgentId — the template is always assigned to you.",
  context: "chat",
} as const;

export const draftSelfTaskTemplateUpdateToolMetadata = {
  name: "draft_self_task_template_update",
  description:
    "Open an operator review form to edit one of your own CommandsCenter task templates. Execution pauses until the operator reviews and confirms the proposed changes. Use this only in chat, only when you want to modify a template assigned to you and need operator approval before the update is saved. Will fail if the specified template belongs to a different specialist. Do not call this to update another specialist's template.",
  context: "chat",
} as const;

export const runSelfTaskToolMetadata = {
  name: "run_self_task",
  description:
    "Queue one of your own CommandsCenter tasks and wait here until it finishes. Returns the completed run including result text, final message, outcome, and artifacts so you can act on the output. Use this only in chat — calling it inside a task run would deadlock because the agent can only execute one task at a time. Will fail if the task is assigned to a different specialist. Times out after approximately 9 minutes if the task has not reached a terminal state.",
  context: "chat",
} as const;

// Phase 2: operator-blocking and blocking-wait self task tools. These live in
// the separate cc_default_interactive group so the interactive timeout applies
// only to them, keeping the cc_default quick-tool timeout tight.
export function createSelfTaskLiveToolDefinitions(options: SelfTaskLiveToolOptions) {
  return [
    {
      name: runSelfTaskToolMetadata.name,
      description: runSelfTaskToolMetadata.description,
      context: runSelfTaskToolMetadata.context,
      inputSchema: runSelfTaskInputSchema,
      outputSchema: mcpTaskRunSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = runSelfTaskInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          await requireSelfTask(options.taskService, parsed.taskId, agentId);

          const run = await options.taskExecutionService.queue(parsed.taskId, {
            triggerSource: "manual",
            metadata: parsed.metadata,
          });

          // Poll until the run reaches a terminal state. Using DB polling rather
          // than a subscribe model — the 10-min cc_default_interactive timeout
          // gives ample headroom, and 3 s intervals produce negligible DB load.
          const terminal = await pollForTerminalRun(
            options.taskService,
            run.id,
            9 * 60 * 1_000, // hard deadline just under the 10-min MCP timeout
          );

          if (terminal.status === "failed") {
            const msg = terminal.errorMessage ?? "Task run failed.";
            const structuredContent = {
              error: { message: msg },
              run: mcpTaskRunSchema.parse(withTaskRunBoardUrl(options.config, terminal)),
            };
            return {
              isError: true,
              structuredContent,
              content: [
                {
                  type: "text" as const,
                  text: `${msg}\n\n${JSON.stringify(structuredContent, null, 2)}`,
                },
              ],
            };
          }

          if (terminal.status === "cancelled") {
            const msg = "Task run was cancelled before it could complete.";
            const structuredContent = {
              error: { message: msg },
              run: mcpTaskRunSchema.parse(withTaskRunBoardUrl(options.config, terminal)),
            };
            return {
              isError: true,
              structuredContent,
              content: [
                {
                  type: "text" as const,
                  text: `${msg}\n\n${JSON.stringify(structuredContent, null, 2)}`,
                },
              ],
            };
          }

          return success(
            "Task run completed.",
            mcpTaskRunSchema.parse(withTaskRunBoardUrl(options.config, terminal)),
          );
        }, "Failed to run task."),
    },
    {
      name: draftSelfTaskToolMetadata.name,
      description: draftSelfTaskToolMetadata.description,
      context: draftSelfTaskToolMetadata.context,
      inputSchema: draftSelfTaskInputSchema,
      outputSchema: mcpTaskSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const draft = draftSelfTaskInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const reviewed = await openReviewForm(options, {
            agentId,
            kind: "self_task_create_review",
            title: "Review task",
            description: "Review and edit the task. It will be assigned to you once you confirm.",
            fields: [
              textField("title", "Title", draft.title, true),
              textareaField("description", "Description", draft.description),
              textField("scheduledAt", "Scheduled at", draft.scheduledAt ?? undefined),
              textField("dueAt", "Due at", draft.dueAt ?? undefined),
              textareaField("contextText", "Context", draft.context?.text),
            ],
            metadata: {
              taskTitle: draft.title,
              operation: "create_self_task",
              callerAgentId: agentId,
            },
          });

          const task = await options.taskService.create(
            createTaskInputSchema.parse({
              title: reviewed["title"],
              description: emptyToUndefined(reviewed["description"]),
              agentId,
              scheduledAt: emptyToUndefined(reviewed["scheduledAt"]),
              dueAt: emptyToUndefined(reviewed["dueAt"]),
              context:
                reviewed["contextText"] === undefined
                  ? undefined
                  : applyContextText(undefined, reviewed["contextText"]),
            }),
          );

          return success(
            "Task created.",
            mcpTaskSchema.parse(withTaskBoardUrl(options.config, task)),
          );
        }, "Failed to draft task."),
    },
    {
      name: draftSelfTaskUpdateToolMetadata.name,
      description: draftSelfTaskUpdateToolMetadata.description,
      context: draftSelfTaskUpdateToolMetadata.context,
      inputSchema: draftSelfTaskUpdateInputSchema,
      outputSchema: mcpTaskSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = draftSelfTaskUpdateInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const current = await requireSelfTask(options.taskService, parsed.taskId, agentId);

          const suggested = parsed.input;
          const changed = suggested ? Object.keys(suggested) : [];
          const showAll = changed.length === 0;
          const includes = (key: string) => showAll || changed.includes(key);

          const fields: ReturnType<typeof textField | typeof textareaField>[] = [];

          if (includes("title")) {
            fields.push(textField("title", "Title", suggested?.title ?? current.title, true));
          }
          if (includes("description")) {
            fields.push(
              textareaField(
                "description",
                "Description",
                suggested?.description ?? current.description,
              ),
            );
          }
          if (includes("scheduledAt")) {
            fields.push(
              textField(
                "scheduledAt",
                "Scheduled at",
                suggested?.scheduledAt ?? current.scheduledAt ?? undefined,
              ),
            );
          }
          if (includes("dueAt")) {
            fields.push(
              textField("dueAt", "Due at", suggested?.dueAt ?? current.dueAt ?? undefined),
            );
          }
          if (includes("context")) {
            fields.push(
              textareaField(
                "contextText",
                "Context",
                suggested?.context?.text ?? current.context?.text,
              ),
            );
          }

          const reviewed = await openReviewForm(options, {
            agentId,
            kind: "self_task_update_review",
            title: "Review task update",
            description:
              "Review and edit the update. Changes apply only to your task once you confirm.",
            fields,
            metadata: {
              taskId: parsed.taskId,
              taskTitle: current.title,
              operation: "update_self_task",
              callerAgentId: agentId,
            },
          });

          const update: Record<string, unknown> = {};
          if ("title" in reviewed) update["title"] = reviewed["title"];
          if ("description" in reviewed)
            update["description"] = emptyToUndefined(reviewed["description"]);
          if ("scheduledAt" in reviewed)
            update["scheduledAt"] = emptyToUndefined(reviewed["scheduledAt"]);
          if ("dueAt" in reviewed) update["dueAt"] = emptyToUndefined(reviewed["dueAt"]);
          if ("contextText" in reviewed) {
            update["context"] = applyContextText(current.context, reviewed["contextText"]);
          }

          const task = await options.taskService.update(
            parsed.taskId,
            updateTaskInputSchema.omit({ agentId: true, defaultAgentId: true }).parse(update),
          );

          if (!task) {
            throw new Error("Task not found.");
          }

          return success(
            "Task updated.",
            mcpTaskSchema.parse(withTaskBoardUrl(options.config, task)),
          );
        }, "Failed to draft task update."),
    },
    {
      name: draftSelfTaskTemplateToolMetadata.name,
      description: draftSelfTaskTemplateToolMetadata.description,
      context: draftSelfTaskTemplateToolMetadata.context,
      inputSchema: draftSelfTaskTemplateInputSchema,
      outputSchema: mcpTaskTemplateSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const draft = draftSelfTaskTemplateInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const reviewed = await openReviewForm(options, {
            agentId,
            kind: "self_task_template_create_review",
            title: "Review task template",
            description:
              "Review and edit the template title and description. It will be assigned to you once you confirm. Other settings (recurrence, acceptance criteria, model) from your input are preserved.",
            fields: [
              textField("title", "Title", draft.title, true),
              textareaField("description", "Description", draft.description),
            ],
            metadata: {
              templateTitle: draft.title,
              operation: "create_self_task_template",
              callerAgentId: agentId,
            },
          });

          // Merge the operator-reviewed fields over the original draft. Any settings
          // the specialist passed (recurrence, todos, model, etc.) are preserved; only
          // title and description go through the review form.
          const template = await options.taskService.createTemplate(
            createTaskTemplateInputSchema.parse({
              ...draft,
              title: reviewed["title"],
              description: emptyToUndefined(reviewed["description"]) ?? "",
              defaultAgentId: agentId,
            }),
          );

          return success(
            "Task template created.",
            mcpTaskTemplateSchema.parse(withTaskTemplateBoardUrl(options.config, template)),
          );
        }, "Failed to draft task template."),
    },
    {
      name: draftSelfTaskTemplateUpdateToolMetadata.name,
      description: draftSelfTaskTemplateUpdateToolMetadata.description,
      context: draftSelfTaskTemplateUpdateToolMetadata.context,
      inputSchema: draftSelfTaskTemplateUpdateInputSchema,
      outputSchema: mcpTaskTemplateSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = draftSelfTaskTemplateUpdateInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const current = await requireSelfTemplate(
            options.taskService,
            parsed.templateId,
            agentId,
          );

          const suggested = parsed.input;
          const changed = suggested ? Object.keys(suggested) : [];
          const hasReviewedField = changed.some((key) => key === "title" || key === "description");
          const showAll = changed.length === 0 || !hasReviewedField;
          const includes = (key: "title" | "description") => showAll || changed.includes(key);

          const fields: ReturnType<typeof textField | typeof textareaField>[] = [];
          if (includes("title")) {
            fields.push(textField("title", "Title", suggested?.title ?? current.title, true));
          }
          if (includes("description")) {
            fields.push(
              textareaField(
                "description",
                "Description",
                suggested?.description ?? current.description,
              ),
            );
          }
          const presentedFields = new Set(fields.map((field) => field.name));

          const reviewed = await openReviewForm(options, {
            agentId,
            kind: "self_task_template_update_review",
            title: "Review task template update",
            description:
              "Review and edit the template update. Changes apply only to your template once you confirm. Other settings from the proposed update are preserved.",
            fields,
            metadata: {
              templateId: parsed.templateId,
              templateTitle: current.title,
              operation: "update_self_task_template",
              callerAgentId: agentId,
            },
          });

          const update: Record<string, unknown> = { ...(suggested ?? {}) };
          if (presentedFields.has("title") && "title" in reviewed) {
            update["title"] = reviewed["title"];
          }
          if (presentedFields.has("description") && "description" in reviewed) {
            update["description"] = emptyToUndefined(reviewed["description"]) ?? "";
          }

          const template = await options.taskService.updateTemplate(
            parsed.templateId,
            updateSelfTaskTemplateInputSchema.parse(update),
          );

          if (!template) {
            throw new Error("Task template not found.");
          }

          return success(
            "Task template updated.",
            mcpTaskTemplateSchema.parse(withTaskTemplateBoardUrl(options.config, template)),
          );
        }, "Failed to draft task template update."),
    },
  ] as const;
}

async function executeTool(
  action: () => Promise<ToolResult>,
  fallbackMessage: string,
): Promise<ToolResult> {
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

// Appends the full structured result to the tool's text output so the UI's
// tool-call log (and any consumer reading content[].text) shows the exact
// data the specialist received, not just a short confirmation string.
function success(message: string, structuredContent: Record<string, unknown>): ToolResult {
  return {
    structuredContent,
    content: [
      { type: "text", text: `${message}\n\n${JSON.stringify(structuredContent, null, 2)}` },
    ],
  };
}

async function requireCallingAgentId(db: AppDb, agentSlug: string): Promise<string> {
  const row = await db.query.agents.findFirst({
    where: (table, operators) => operators.eq(table.slug, agentSlug),
    columns: { id: true },
  });

  if (!row) {
    throw new Error(`Specialist '${agentSlug}' not found.`);
  }

  return row.id;
}

async function requireSelfTask(
  taskService: TaskService,
  taskId: string,
  agentId: string,
): Promise<Task> {
  const task = await taskService.get(taskId);

  if (!task || task.agentId !== agentId) {
    throw new Error("Task not found.");
  }

  return task;
}

async function openReviewForm(
  options: Pick<SelfTaskLiveToolOptions, "conversationService" | "liveRequestService">,
  input: {
    agentId: string;
    kind: string;
    title: string;
    description: string;
    fields: Array<{
      type: "text" | "textarea";
      name: string;
      label: string;
      required: boolean;
      defaultValue?: string;
    }>;
    metadata: Record<string, unknown>;
  },
): Promise<Record<string, string>> {
  if (!options.conversationService || !options.liveRequestService) {
    throw new Error("Drafting a task requires chat live requests.");
  }

  const snapshot = await options.conversationService.resolveCurrent(input.agentId);
  const decision = await options.liveRequestService.create({
    conversationId: snapshot.current.id,
    kind: input.kind,
    closable: false,
    presentation: {
      title: input.title,
      description: input.description,
      submitLabel: "Apply",
      cancelLabel: "Cancel",
    },
    fields: input.fields,
    metadata: input.metadata,
    actions: [
      {
        id: "cancel",
        label: "Cancel",
        variant: "secondary" as const,
        kind: "cancel" as const,
        disabledWhen: [],
      },
      {
        id: "submit",
        label: "Apply",
        variant: "primary" as const,
        kind: "submit" as const,
        disabledWhen: input.fields
          .filter((field) => field.required)
          .map((field) => ({ rule: "field_empty" as const, field: field.name })),
      },
    ],
  });

  return reviewDecisionSchema.parse(decision).values;
}

function textField(
  name: string,
  label: string,
  defaultValue: string | undefined,
  required = false,
): { type: "text"; name: string; label: string; required: boolean; defaultValue?: string } {
  return { type: "text", name, label, required, defaultValue };
}

function textareaField(
  name: string,
  label: string,
  defaultValue: string | undefined,
  required = false,
): { type: "textarea"; name: string; label: string; required: boolean; defaultValue?: string } {
  return { type: "textarea", name, label, required, defaultValue };
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

function applyContextText(
  context: { text?: string; attachments?: unknown[] } | undefined,
  text: string,
): z.infer<typeof taskContextSchema> {
  return taskContextSchema.parse({ ...context, text: emptyToUndefined(text) });
}

// Poll until the run reaches a terminal state or the deadline passes.
// Throws if the deadline is exceeded without a terminal status.
async function pollForTerminalRun(
  taskService: TaskService,
  runId: string,
  maxWaitMs: number,
): Promise<TaskRun> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await sleep(RUN_POLL_INTERVAL_MS);
    const run = await taskService.getRunById(runId);

    if (!run) {
      throw new Error("Task run not found while waiting for completion.");
    }

    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      return run;
    }
  }

  throw new Error("Timed out waiting for the task run to reach a terminal state (limit: 9 min).");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
