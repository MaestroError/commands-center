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
  title: titleField,
  markdown: markdownField,
  taskRunId: z.string().trim().min(1).optional(),
});

const notifyWarningInputSchema = notifyInfoInputSchema;

const proposeTaskInputSchema = z.object({
  title: titleField,
  reason: reasonField,
  assigneeSlug: slugField.optional(),
  prompt: z.string().trim().min(1).max(20_000).optional(),
});

const proposeTaskTemplateInputSchema = proposeTaskInputSchema;

const proposeRunTaskTemplateInputSchema = z.object({
  templateId: z.string().trim().min(1),
  reason: reasonField,
});

const proposeRunCommandInputSchema = z.object({
  command: z.string().trim().min(1).max(4_000),
  reason: reasonField.optional(),
  cwd: z.string().trim().min(1).optional(),
});

const emittedOutputSchema = z.object({ posted: z.literal(true), activityId: z.string().min(1) });

const notifyInfoToolMetadata = {
  name: "notify_info",
  description:
    "Post an informational notification (markdown) to the operator's activity feed. A completion notification is already sent when a task run finishes — use this only for something important the operator should know beyond the normal result. Non-blocking: you do not wait for or learn the operator's response.",
  context: "task_run",
} as const satisfies CcManagedToolMetadata;

const notifyWarningToolMetadata = {
  name: "notify_warning",
  description:
    "Post a warning notification (markdown) to the operator's activity feed. Use when action is needed, or to flag that you had to change the planned execution path (e.g. a required CLI failed and you fell back to an MCP). Non-blocking: you do not wait for or learn the operator's response.",
  context: "task_run",
} as const satisfies CcManagedToolMetadata;

const proposeTaskToolMetadata = {
  name: "propose_task",
  description:
    "Propose a new task for the operator to create. Posts an action card (title, reason, optional assignee specialist) with a Create button; the operator decides. Non-blocking: nothing is created until the operator confirms, and you never learn the outcome.",
  context: "task_run",
} as const satisfies CcManagedToolMetadata;

const proposeTaskTemplateToolMetadata = {
  name: "propose_task_template",
  description:
    "Propose a new recurring task template for the operator to create. Posts an action card (title, reason, optional assignee specialist) with a Create button; the operator decides. Non-blocking: nothing is created until the operator confirms.",
  context: "task_run",
} as const satisfies CcManagedToolMetadata;

const proposeRunTaskTemplateToolMetadata = {
  name: "propose_run_task_template",
  description:
    "Propose running an existing task template now. Posts an action card showing the template with a Run button; the operator decides. Non-blocking: nothing runs until the operator confirms.",
  context: "task_run",
} as const satisfies CcManagedToolMetadata;

const proposeRunCommandToolMetadata = {
  name: "propose_run_command",
  description:
    "Propose a terminal command for the operator to run. Posts an action card with the command and a Run button that opens the operator's terminal prefilled with it (they review and press Enter). Non-blocking: nothing runs until the operator chooses to.",
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
              prompt: parsed.prompt,
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
              prompt: parsed.prompt,
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
