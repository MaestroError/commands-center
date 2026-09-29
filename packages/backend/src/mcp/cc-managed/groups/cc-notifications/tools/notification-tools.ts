import { recurringTaskScheduleSchema } from "@cc/shared/schemas";
import { z } from "zod";

import type { AppDb } from "../../../../../db/client.js";
import type { ActivityService } from "../../../../../services/activity-service.js";
import type { CcManagedToolDefinition, CcManagedToolMetadata } from "../../../server-registry.js";

// All notification tools are non-blocking: they post a card to the operator's
// activity feed and return immediately. The specialist never waits for, and
// never learns, the operator's decision. `*_proposal` cards carry a typed
// payload the operator confirms from the feed.

const titleField = z.string().trim().min(1).max(500);
const markdownField = z.string().trim().min(1).max(20_000);
const reasonField = z.string().trim().min(1).max(4_000);
const slugField = z.string().trim().min(1).max(200);

const notifyInfoInputSchema = z.object({
  title: titleField.describe("Short title shown at the top of the notification card."),
  markdown: markdownField.describe(
    "The notification body in markdown — the message shown to the operator.",
  ),
  taskRunId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional id of the current task run to link this notification to (from <TaskRun>)."),
});

const notifyWarningInputSchema = notifyInfoInputSchema;

const proposeTaskInputSchema = z.object({
  title: titleField.describe("Short title for the proposed task."),
  reason: reasonField.describe(
    "Why you are proposing this to the operator — a short justification shown on the proposal card. This is NOT the task's instructions; do not put the task content here.",
  ),
  assigneeSlug: slugField
    .optional()
    .describe(
      "Slug of the specialist that should own and run the task. Defaults to you (the proposing specialist) if omitted.",
    ),
  taskDescription: z
    .string()
    .trim()
    .min(1)
    .max(20_000)
    .optional()
    .describe(
      "The actual task instructions/body that will prefill the new task if the operator creates it. Leave empty if you have no specific instructions to hand off.",
    ),
});

const proposeTaskTemplateInputSchema = proposeTaskInputSchema.extend({
  recurrence: recurringTaskScheduleSchema
    .nullish()
    .describe("Optional recurring schedule (mode/anchorAt/timezone/repeatRule) for the template."),
});

const proposeRunTaskTemplateInputSchema = z.object({
  templateId: z
    .string()
    .trim()
    .min(1)
    .describe("Id of the existing task template to run. Use a template-listing tool to find ids."),
  reason: reasonField.describe(
    "Why the operator should run this template now — shown on the proposal card.",
  ),
});

const proposeRunCommandInputSchema = z.object({
  command: z
    .string()
    .trim()
    .min(1)
    .max(4_000)
    .describe(
      "The exact terminal command to propose. The operator's terminal opens prefilled with it; it is never run automatically.",
    ),
  reason: reasonField
    .optional()
    .describe("Optional explanation of why this command should be run — shown on the card."),
  cwd: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional working directory hint for the command."),
});

const emittedOutputSchema = z.object({
  posted: z.literal(true).describe("Always true when the notification was posted to the feed."),
  activityId: z.string().min(1).describe("Id of the created activity-feed card."),
});

const notifyInfoToolMetadata = {
  name: "notify_info",
  description:
    "Post an info notification (markdown) to the user's activity feed. Use only for something important beyond the task's final result.",
  context: "task_run",
} as const satisfies CcManagedToolMetadata;

const notifyWarningToolMetadata = {
  name: "notify_warning",
  description:
    "Post a warning notification (markdown) to the user's activity feed. Use when action is needed, or to flag that you changed the planned execution path (e.g. a required CLI failed and you fell back to an MCP).",
  context: "task_run",
} as const satisfies CcManagedToolMetadata;

const proposeTaskToolMetadata = {
  name: "propose_task",
  description:
    "Propose a new task async — leaves a proposal card in the user's activity feed. `reason` is your justification for the operator (shown on the card); put the actual task instructions in `taskDescription`, not in `reason`.",
  context: "task_run",
} as const satisfies CcManagedToolMetadata;

const proposeTaskTemplateToolMetadata = {
  name: "propose_task_template",
  description:
    "Propose a new recurring task template async — leaves a proposal card in the user's activity feed. `reason` is your justification for the operator; put the actual task instructions in `taskDescription`, and an optional schedule in `recurrence`.",
  context: "task_run",
} as const satisfies CcManagedToolMetadata;

const proposeRunTaskTemplateToolMetadata = {
  name: "propose_run_task_template",
  description:
    "Propose running an existing task template — leaves a Run proposal card in the user's activity feed.",
  context: "task_run",
} as const satisfies CcManagedToolMetadata;

const proposeRunCommandToolMetadata = {
  name: "propose_run_command",
  description:
    "Propose a terminal command — leaves a proposal card in the user's activity feed; running it opens the terminal prefilled with the command.",
  context: "task_run",
} as const satisfies CcManagedToolMetadata;

export const notificationToolMetadata = [
  notifyInfoToolMetadata,
  notifyWarningToolMetadata,
  proposeTaskToolMetadata,
  proposeTaskTemplateToolMetadata,
  proposeRunTaskTemplateToolMetadata,
  proposeRunCommandToolMetadata,
] as const;

export function createNotificationToolDefinitions(options: {
  db: AppDb;
  activityService: ActivityService;
}): CcManagedToolDefinition[] {
  const { db, activityService } = options;

  async function resolveSpecialistSlug(slug: string | undefined): Promise<string | undefined> {
    if (!slug) {
      return undefined;
    }
    const agent = await db.query.agents.findFirst({
      where: (table, operators) =>
        operators.and(operators.eq(table.slug, slug), operators.eq(table.status, "active")),
      columns: { slug: true },
    });
    if (!agent) {
      throw new Error(`Specialist '${slug}' not found.`);
    }
    return agent.slug;
  }

  const posted = (activityId: string, message: string) => ({
    structuredContent: emittedOutputSchema.parse({ posted: true, activityId }),
    content: [{ type: "text" as const, text: message }],
  });

  const failed = (error: unknown, fallback: string) => ({
    isError: true as const,
    content: [{ type: "text" as const, text: error instanceof Error ? error.message : fallback }],
  });

  return [
    {
      ...notifyInfoToolMetadata,
      inputSchema: notifyInfoInputSchema,
      outputSchema: emittedOutputSchema,
      async execute(args, context) {
        try {
          const parsed = notifyInfoInputSchema.parse(args);
          const activity = await activityService.emit({
            kind: "specialist_info",
            level: "info",
            title: parsed.title,
            body: parsed.markdown,
            payload: {
              sourceSpecialistSlug: context.agentSlug,
              proposedBySlug: context.agentSlug,
              taskRunId: parsed.taskRunId,
            },
          });
          return posted(activity.id, "Posted an info notification to the operator's feed.");
        } catch (error) {
          return failed(error, "Failed to post info notification.");
        }
      },
    },
    {
      ...notifyWarningToolMetadata,
      inputSchema: notifyWarningInputSchema,
      outputSchema: emittedOutputSchema,
      async execute(args, context) {
        try {
          const parsed = notifyWarningInputSchema.parse(args);
          const activity = await activityService.emit({
            kind: "specialist_warning",
            level: "action_required",
            title: parsed.title,
            body: parsed.markdown,
            payload: {
              sourceSpecialistSlug: context.agentSlug,
              proposedBySlug: context.agentSlug,
              taskRunId: parsed.taskRunId,
            },
          });
          return posted(activity.id, "Posted a warning notification to the operator's feed.");
        } catch (error) {
          return failed(error, "Failed to post warning notification.");
        }
      },
    },
    {
      ...proposeTaskToolMetadata,
      inputSchema: proposeTaskInputSchema,
      outputSchema: emittedOutputSchema,
      async execute(args, context) {
        try {
          const parsed = proposeTaskInputSchema.parse(args);
          const assigneeSlug = await resolveSpecialistSlug(parsed.assigneeSlug);
          const activity = await activityService.emit({
            kind: "task_proposal",
            level: "action_required",
            title: parsed.title,
            body: parsed.reason,
            payload: {
              title: parsed.title,
              reason: parsed.reason,
              assigneeSlug,
              taskDescription: parsed.taskDescription,
              sourceSpecialistSlug: context.agentSlug,
              proposedBySlug: context.agentSlug,
            },
          });
          return posted(activity.id, "Posted a task proposal to the operator's feed.");
        } catch (error) {
          return failed(error, "Failed to post task proposal.");
        }
      },
    },
    {
      ...proposeTaskTemplateToolMetadata,
      inputSchema: proposeTaskTemplateInputSchema,
      outputSchema: emittedOutputSchema,
      async execute(args, context) {
        try {
          const parsed = proposeTaskTemplateInputSchema.parse(args);
          const assigneeSlug = await resolveSpecialistSlug(parsed.assigneeSlug);
          const activity = await activityService.emit({
            kind: "task_template_proposal",
            level: "action_required",
            title: parsed.title,
            body: parsed.reason,
            payload: {
              title: parsed.title,
              reason: parsed.reason,
              assigneeSlug,
              taskDescription: parsed.taskDescription,
              recurrence: parsed.recurrence ?? undefined,
              sourceSpecialistSlug: context.agentSlug,
              proposedBySlug: context.agentSlug,
            },
          });
          return posted(activity.id, "Posted a task template proposal to the operator's feed.");
        } catch (error) {
          return failed(error, "Failed to post task template proposal.");
        }
      },
    },
    {
      ...proposeRunTaskTemplateToolMetadata,
      inputSchema: proposeRunTaskTemplateInputSchema,
      outputSchema: emittedOutputSchema,
      async execute(args, context) {
        try {
          const parsed = proposeRunTaskTemplateInputSchema.parse(args);
          const template = await db.query.task_templates.findFirst({
            where: (table, operators) =>
              operators.and(
                operators.eq(table.id, parsed.templateId),
                operators.eq(table.archived, false),
              ),
            columns: { id: true, title: true },
          });
          if (!template) {
            throw new Error(`Task template '${parsed.templateId}' not found.`);
          }
          const activity = await activityService.emit({
            kind: "run_template_proposal",
            level: "action_required",
            title: `Run template: ${template.title}`,
            body: parsed.reason,
            payload: {
              templateId: template.id,
              templateTitle: template.title,
              reason: parsed.reason,
              sourceSpecialistSlug: context.agentSlug,
              proposedBySlug: context.agentSlug,
            },
          });
          return posted(activity.id, "Posted a run-template proposal to the operator's feed.");
        } catch (error) {
          return failed(error, "Failed to post run-template proposal.");
        }
      },
    },
    {
      ...proposeRunCommandToolMetadata,
      inputSchema: proposeRunCommandInputSchema,
      outputSchema: emittedOutputSchema,
      async execute(args, context) {
        try {
          const parsed = proposeRunCommandInputSchema.parse(args);
          const activity = await activityService.emit({
            kind: "run_command_proposal",
            level: "action_required",
            title: "Run terminal command",
            body: parsed.reason ?? null,
            payload: {
              command: parsed.command,
              reason: parsed.reason,
              cwd: parsed.cwd,
              sourceSpecialistSlug: context.agentSlug,
              proposedBySlug: context.agentSlug,
            },
          });
          return posted(activity.id, "Posted a run-command proposal to the operator's feed.");
        } catch (error) {
          return failed(error, "Failed to post run-command proposal.");
        }
      },
    },
  ];
}
