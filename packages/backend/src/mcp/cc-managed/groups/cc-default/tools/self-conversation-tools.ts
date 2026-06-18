import { join } from "node:path";

import { z } from "zod";

import type { AppDb } from "../../../../../db/client.js";
import type { ConversationService } from "../../../../../services/conversation-service.js";
import type { SessionArchiveService } from "../../../../../services/session-archive-service.js";
import type { SessionArchiveSettingsService } from "../../../../../services/session-archive-settings-service.js";

type SelfConversationToolOptions = {
  db: AppDb;
  conversationService: ConversationService;
  archiveService?: SessionArchiveService;
  archiveSettingsService?: SessionArchiveSettingsService;
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const listSelfConversationsInputSchema = z
  .object({
    // Larger values are clamped to 50 by the service rather than rejected.
    limit: z.number().int().positive().optional(),
    source: z.enum(["chat", "task_run", "all"]).optional(),
  })
  .strict();

const getSelfConversationInputSchema = z
  .object({
    conversationId: z.string().trim().min(1),
    materialize: z.boolean().optional(),
  })
  .strict();

const conversationSummaryOutputSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  source: z.enum(["chat", "task_run"]),
  taskId: z.string().optional(),
  taskRunId: z.string().optional(),
  messageCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const listSelfConversationsOutputSchema = z.object({
  conversations: z.array(conversationSummaryOutputSchema),
});

const archiveDisabledSchema = z.object({ enabled: z.literal(false) });
const archiveEnabledSchema = z.object({
  enabled: z.literal(true),
  path: z.string(),
  metadataPath: z.string(),
  messagesPath: z.string(),
  transcriptPath: z.string(),
  lastMaterializedAt: z.string().nullable(),
  lastMaterializedMessageCount: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
  isTranscriptStale: z.boolean(),
});

const getSelfConversationOutputSchema = z.object({
  conversation: conversationSummaryOutputSchema,
  archive: z.union([archiveEnabledSchema, archiveDisabledSchema]),
  instruction: z.string(),
});

export const listSelfConversationsToolMetadata = {
  name: "list_self_conversations",
  description:
    "List your own CommandsCenter chat and task-run session summaries, most recently updated first. Returns ids and metadata only; use get_self_conversation to locate a session's archive folder.",
  context: "both",
} as const;

export const getSelfConversationToolMetadata = {
  name: "get_self_conversation",
  description:
    "Return the on-disk session archive folder path for one of your own CommandsCenter conversations so you can read its metadata, messages, and transcript. Optionally refresh the transcript first. Fails for conversations owned by another specialist.",
  context: "both",
} as const;

export function createSelfConversationToolDefinitions(options: SelfConversationToolOptions) {
  return [
    {
      name: listSelfConversationsToolMetadata.name,
      description: listSelfConversationsToolMetadata.description,
      context: listSelfConversationsToolMetadata.context,
      inputSchema: listSelfConversationsInputSchema,
      outputSchema: listSelfConversationsOutputSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = listSelfConversationsInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const summaries = await options.conversationService.listForAgent(agentId, {
            limit: parsed.limit,
            source: parsed.source,
          });
          const conversations = summaries.map((summary) => toSummaryOutput(summary));

          return success(
            `Found ${String(conversations.length)} conversation${
              conversations.length === 1 ? "" : "s"
            }.`,
            { conversations },
          );
        }, "Failed to list conversations."),
    },
    {
      name: getSelfConversationToolMetadata.name,
      description: getSelfConversationToolMetadata.description,
      context: getSelfConversationToolMetadata.context,
      inputSchema: getSelfConversationInputSchema,
      outputSchema: getSelfConversationOutputSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = getSelfConversationInputSchema.parse(args);
          const agent = await requireCallingAgent(options.db, context.agentSlug);
          const summary = await options.conversationService.getSummaryForAgent(
            agent.id,
            parsed.conversationId,
          );

          if (!summary) {
            throw new Error("Conversation not found.");
          }

          const conversation = toSummaryOutput(summary);
          const archiveService = options.archiveService;
          const enabled = archiveService
            ? ((await options.archiveSettingsService?.get())?.sessionArchiveEnabled ?? true)
            : false;

          if (!archiveService || !enabled) {
            return success("Session archive is disabled.", {
              conversation,
              archive: { enabled: false },
              instruction:
                "Session archiving is disabled, so there is no archive folder for this conversation.",
            });
          }

          const specialist = { id: agent.id, slug: agent.slug, name: agent.name };
          let archivePath: string;
          let metadata;

          if (summary.source === "task_run" && summary.taskId && summary.taskRunId) {
            metadata = await archiveService.ensureTaskRunArchive({
              specialist,
              conversationId: summary.id,
              opencodeSessionId: summary.opencodeSessionId,
              taskId: summary.taskId,
              taskRunId: summary.taskRunId,
              title: summary.title ?? null,
            });
            archivePath = archiveService.resolveTaskRunArchivePath({
              agentId: agent.id,
              taskId: summary.taskId,
              taskRunId: summary.taskRunId,
            });
          } else {
            metadata = await archiveService.ensureChatArchive({
              specialist,
              conversationId: summary.id,
              opencodeSessionId: summary.opencodeSessionId,
              title: summary.title ?? null,
            });
            archivePath = archiveService.resolveChatArchivePath({
              agentId: agent.id,
              conversationId: summary.id,
            });
          }

          if (parsed.materialize) {
            metadata = (await archiveService.materialize({ archivePath, force: true })) ?? metadata;
          }

          const isTranscriptStale = metadata.messageCount > metadata.lastMaterializedMessageCount;
          const transcriptPath = join(archivePath, metadata.files.transcript);
          const baseInstruction = `Check this folder for the requested session data: ${archivePath}`;
          const instruction = isTranscriptStale
            ? `${baseInstruction}\nThe transcript may not include the latest messages. Compare metadata.messageCount with metadata.lastMaterializedMessageCount and read messages.jsonl for the tail.`
            : baseInstruction;

          return success("Session archive located.", {
            conversation,
            archive: {
              enabled: true,
              path: archivePath,
              metadataPath: join(archivePath, "metadata.json"),
              messagesPath: join(archivePath, metadata.files.messages),
              transcriptPath,
              lastMaterializedAt: metadata.lastMaterializedAt,
              lastMaterializedMessageCount: metadata.lastMaterializedMessageCount,
              messageCount: metadata.messageCount,
              isTranscriptStale,
            },
            instruction,
          });
        }, "Failed to get conversation archive."),
    },
  ];
}

function toSummaryOutput(summary: {
  id: string;
  title?: string;
  source: "chat" | "task_run";
  taskId?: string;
  taskRunId?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: summary.id,
    title: summary.title,
    source: summary.source,
    taskId: summary.taskId,
    taskRunId: summary.taskRunId,
    messageCount: summary.messageCount,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
  };
}

async function requireCallingAgentId(db: AppDb, agentSlug: string): Promise<string> {
  return (await requireCallingAgent(db, agentSlug)).id;
}

async function requireCallingAgent(
  db: AppDb,
  agentSlug: string,
): Promise<{ id: string; slug: string; name: string }> {
  const row = await db.query.agents.findFirst({
    where: (table, operators) => operators.eq(table.slug, agentSlug),
    columns: { id: true, slug: true, name: true },
  });

  if (!row) {
    throw new Error(`Specialist '${agentSlug}' not found.`);
  }

  return row;
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

function success(message: string, structuredContent: Record<string, unknown>): ToolResult {
  return {
    structuredContent,
    content: [{ type: "text", text: message }],
  };
}
