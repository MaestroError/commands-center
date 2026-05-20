import { desc, eq } from "drizzle-orm";

import {
  conversationDetailSchema,
  conversationMessageSchema,
  conversationSnapshotSchema,
  conversationSummarySchema,
  type ConversationDetail,
  sessionMediaListSchema,
  sendConversationCommandInputSchema,
  sendConversationPromptInputSchema,
  sendConversationShellInputSchema,
  type ConversationMessage,
  type ConversationSnapshot,
  type ConversationSummary,
  type SessionMediaItem,
  type SendConversationCommandInput,
  type SendConversationPromptInput,
  type SendConversationShellInput,
} from "../schemas/conversations.js";

import { createId } from "../db/ids.js";
import type { AppDb } from "../db/client.js";
import { type agents, conversations, messages } from "../db/schema/index.js";
import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import { cleanTitle, extractMediaItems, mapRemoteMessage } from "../lib/message-mapper.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { resolveAgentWorkspacePath } from "./agent-workspace.js";
import type { OpenCodeService, OpenCodeSessionPermissionRule } from "./opencode-service.js";

type AgentRow = typeof agents.$inferSelect;
type AgentRuntimeRow = AgentRow & { workspace_path: string };
type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

export type TaskRunSessionDiagnostic = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type TaskRunConversationInspection = {
  conversation?: ConversationDetail;
  diagnostics: TaskRunSessionDiagnostic[];
  canOpenInChat: boolean;
};

export type ConversationService = ReturnType<typeof createConversationService>;

export function createConversationService(options: {
  db: AppDb;
  config: RuntimeConfig;
  opencodeService: OpenCodeService;
}) {
  return {
    async resolveCurrent(agentId: string): Promise<ConversationSnapshot> {
      const agent = await getAgent(agentId);
      let current = await options.db.query.conversations.findFirst({
        where: (table, operators) =>
          operators.and(
            operators.eq(table.agent_id, agent.id),
            operators.eq(table.is_current, true),
            operators.eq(table.source, "chat"),
          ),
        orderBy: (table, operators) => [operators.desc(table.updated_at)],
      });

      if (!current) {
        current = await createConversation(agent);
      }

      await syncConversation(agent, current);
      return getSnapshot(agent.id, current.id);
    },

    async list(agentId: string): Promise<ConversationSummary[]> {
      const agent = await getAgent(agentId);
      return listConversationSummaries(agent.id);
    },

    async get(agentId: string, conversationId: string): Promise<ConversationDetail> {
      const agent = await getAgent(agentId);
      const conversation = await getConversationRow(agent.id, conversationId);
      await syncConversation(agent, conversation);
      return mapConversationDetail(conversation);
    },

    async getMedia(conversationId: string): Promise<SessionMediaItem[]> {
      const loaded = await getConversationAgent(conversationId);
      const remoteMessages = await options.opencodeService.listSessionMessages(
        loaded.agent.workspace_path,
        loaded.conversation.opencode_session_id,
      );

      return sessionMediaListSchema.parse(extractMediaItems(remoteMessages));
    },

    async startFresh(agentId: string): Promise<ConversationSnapshot> {
      const agent = await getAgent(agentId);
      const created = await createConversation(agent);
      return getSnapshot(agent.id, created.id);
    },

    async createTaskRunConversation(input: {
      agentId: string;
      taskId: string;
      taskRunId: string;
      title: string;
      permission?: OpenCodeSessionPermissionRule[];
    }): Promise<ConversationDetail> {
      const agent = await getAgent(input.agentId);
      const conversation = await createConversation(agent, {
        source: "task_run",
        title: input.title,
        taskId: input.taskId,
        taskRunId: input.taskRunId,
        makeCurrent: false,
        permission: input.permission,
      });

      return getConversationDetail(conversation.id);
    },

    async sendTaskRunPrompt(
      conversationId: string,
      input: SendConversationPromptInput,
    ): Promise<ConversationDetail> {
      const parsed = sendConversationPromptInputSchema.parse(input);
      const loaded = await getConversationAgent(conversationId, { includeTaskRun: true });

      if (loaded.conversation.source !== "task_run") {
        throw new BadRequestError("Conversation is not a task run session.");
      }

      await options.opencodeService.promptSession({
        directory: loaded.agent.workspace_path,
        sessionID: loaded.conversation.opencode_session_id,
        agent: resolveOpenCodeAgent(loaded.agent.slug),
        model: parseModel(loaded.agent.default_model),
        text: parsed.text,
        attachments: parsed.attachments,
      });
      await syncConversation(loaded.agent, loaded.conversation);
      return getConversationDetail(loaded.conversation.id);
    },

    async inspectTaskRunConversation(
      taskId: string,
      taskRunId: string,
    ): Promise<TaskRunConversationInspection> {
      const conversation = await getTaskRunConversationRow(taskId, taskRunId);

      if (!conversation) {
        return {
          diagnostics: [
            {
              code: "session_not_recorded",
              message: "No task-owned chat session is recorded for this run.",
            },
          ],
          canOpenInChat: false,
        };
      }

      const agent = await getAgent(conversation.agent_id);
      const diagnostics: TaskRunSessionDiagnostic[] = [];

      try {
        await syncConversation(agent, conversation);
      } catch (error) {
        diagnostics.push({
          code: "session_sync_failed",
          message: error instanceof Error ? error.message : "Task session could not be synced.",
          details: { opencodeSessionId: conversation.opencode_session_id },
        });
      }

      return {
        conversation: await getConversationDetail(conversation.id),
        diagnostics,
        canOpenInChat: diagnostics.length === 0,
      };
    },

    async openTaskRunConversationInChat(
      taskId: string,
      taskRunId: string,
    ): Promise<ConversationSnapshot> {
      const conversation = await getTaskRunConversationRow(taskId, taskRunId);

      if (!conversation) {
        throw new NotFoundError("Task run session not found.");
      }

      const agent = await getAgent(conversation.agent_id);
      await syncConversation(agent, conversation);
      await setCurrentConversation(agent.id, conversation.id);
      await options.db
        .update(conversations)
        .set({
          source: "chat",
          converted_at: conversation.converted_at ?? new Date(),
          updated_at: new Date(),
        })
        .where(eq(conversations.id, conversation.id));

      return getSnapshot(agent.id, conversation.id);
    },

    async sendPrompt(
      conversationId: string,
      input: SendConversationPromptInput,
    ): Promise<ConversationDetail> {
      const parsed = sendConversationPromptInputSchema.parse(input);
      const loaded = await getConversationAgent(conversationId);

      await setCurrentConversation(loaded.agent.id, loaded.conversation.id);
      await options.opencodeService.promptSession({
        directory: loaded.agent.workspace_path,
        sessionID: loaded.conversation.opencode_session_id,
        agent: resolveOpenCodeAgent(loaded.agent.slug),
        model: parseModel(loaded.agent.default_model),
        text: parsed.text,
        attachments: parsed.attachments,
      });
      await syncConversation(loaded.agent, loaded.conversation);
      return getConversationDetail(loaded.conversation.id);
    },

    async sendCommand(
      conversationId: string,
      input: SendConversationCommandInput,
    ): Promise<ConversationDetail> {
      const parsed = sendConversationCommandInputSchema.parse(input);
      const loaded = await getConversationAgent(conversationId);

      await setCurrentConversation(loaded.agent.id, loaded.conversation.id);
      await options.opencodeService.commandSession({
        directory: loaded.agent.workspace_path,
        sessionID: loaded.conversation.opencode_session_id,
        agent: resolveOpenCodeAgent(loaded.agent.slug),
        model: loaded.agent.default_model,
        command: parsed.command,
        arguments: parsed.arguments,
        attachments: parsed.attachments,
      });
      await syncConversation(loaded.agent, loaded.conversation);
      return getConversationDetail(loaded.conversation.id);
    },

    async summarize(conversationId: string): Promise<ConversationDetail> {
      const loaded = await getConversationAgent(conversationId);
      const model = parseModel(loaded.agent.default_model);

      await setCurrentConversation(loaded.agent.id, loaded.conversation.id);
      await options.opencodeService.summarizeSession({
        directory: loaded.agent.workspace_path,
        sessionID: loaded.conversation.opencode_session_id,
        providerID: model.providerID,
        modelID: model.modelID,
      });
      await syncConversation(loaded.agent, loaded.conversation);
      return getConversationDetail(loaded.conversation.id);
    },

    async sendShell(
      conversationId: string,
      input: SendConversationShellInput,
    ): Promise<ConversationDetail> {
      const parsed = sendConversationShellInputSchema.parse(input);
      const loaded = await getConversationAgent(conversationId);

      await setCurrentConversation(loaded.agent.id, loaded.conversation.id);
      await options.opencodeService.shellSession({
        directory: loaded.agent.workspace_path,
        sessionID: loaded.conversation.opencode_session_id,
        agent: resolveOpenCodeAgent(loaded.agent.slug),
        model: parseModel(loaded.agent.default_model),
        command: parsed.command,
      });
      await syncConversation(loaded.agent, loaded.conversation);
      return getConversationDetail(loaded.conversation.id);
    },

    async sendPromptAsync(
      conversationId: string,
      input: SendConversationPromptInput,
    ): Promise<void> {
      const parsed = sendConversationPromptInputSchema.parse(input);
      const loaded = await getConversationAgent(conversationId);

      await setCurrentConversation(loaded.agent.id, loaded.conversation.id);
      await options.opencodeService.promptSessionAsync({
        directory: loaded.agent.workspace_path,
        sessionID: loaded.conversation.opencode_session_id,
        agent: resolveOpenCodeAgent(loaded.agent.slug),
        model: parseModel(loaded.agent.default_model),
        text: parsed.text,
        attachments: parsed.attachments,
      });
    },

    async resolveConversationAgent(conversationId: string) {
      return getConversationAgent(conversationId);
    },

    async replyPermission(
      conversationId: string,
      requestId: string,
      reply: "once" | "always" | "reject",
    ): Promise<void> {
      const loaded = await getConversationAgent(conversationId);
      await options.opencodeService.replyPermission(loaded.agent.workspace_path, requestId, reply);
    },

    async replyQuestion(
      conversationId: string,
      requestId: string,
      answers: string[][],
    ): Promise<void> {
      const loaded = await getConversationAgent(conversationId);
      await options.opencodeService.replyQuestion(loaded.agent.workspace_path, requestId, answers);
    },

    async rejectQuestion(conversationId: string, requestId: string): Promise<void> {
      const loaded = await getConversationAgent(conversationId);
      await options.opencodeService.rejectQuestion(loaded.agent.workspace_path, requestId);
    },

    async abortConversation(conversationId: string): Promise<void> {
      const loaded = await getConversationAgent(conversationId);
      await options.opencodeService.abortSession(
        loaded.agent.workspace_path,
        loaded.conversation.opencode_session_id,
      );
    },

    async updateTitle(conversationId: string, title: string): Promise<void> {
      const cleaned = cleanTitle(title);
      if (!cleaned) return;
      await options.db
        .update(conversations)
        .set({ title: cleaned })
        .where(eq(conversations.id, conversationId));
    },

    async deleteConversation(agentId: string, conversationId: string): Promise<void> {
      const agent = await getAgent(agentId);
      const conversation = await options.db.query.conversations.findFirst({
        where: (table, ops) =>
          ops.and(ops.eq(table.id, conversationId), ops.eq(table.agent_id, agent.id)),
      });

      if (!conversation) throw new NotFoundError("Conversation not found.");

      if (conversation.source === "task_run" && !conversation.converted_at) {
        throw new BadRequestError("Task run sessions cannot be deleted from normal chat history.");
      }

      // Best-effort: delete from OpenCode (session may already be gone)
      try {
        await options.opencodeService.deleteSession(
          agent.workspace_path,
          conversation.opencode_session_id,
        );
      } catch {
        // ignore
      }

      await options.db.delete(messages).where(eq(messages.conversation_id, conversation.id));
      await options.db.delete(conversations).where(eq(conversations.id, conversation.id));
    },
  };

  async function getAgent(agentId: string): Promise<AgentRuntimeRow> {
    const agent = await options.db.query.agents.findFirst({
      where: (table, operators) => operators.eq(table.id, agentId),
    });

    if (!agent || agent.status !== "active") {
      throw new NotFoundError("Agent not found.");
    }

    return withResolvedWorkspacePath(agent);
  }

  async function getConversationRow(
    agentId: string,
    conversationId: string,
  ): Promise<ConversationRow> {
    const conversation = await options.db.query.conversations.findFirst({
      where: (table, operators) =>
        operators.and(
          operators.eq(table.id, conversationId),
          operators.eq(table.agent_id, agentId),
          operators.eq(table.status, "active"),
          operators.eq(table.source, "chat"),
        ),
    });

    if (!conversation) {
      throw new NotFoundError("Conversation not found.");
    }

    return conversation;
  }

  async function getConversationAgent(
    conversationId: string,
    optionsOverride: { includeTaskRun?: boolean } = {},
  ): Promise<{
    agent: AgentRuntimeRow;
    conversation: ConversationRow;
  }> {
    const conversation = await options.db.query.conversations.findFirst({
      where: (table, operators) => operators.eq(table.id, conversationId),
    });

    if (
      !conversation ||
      conversation.status !== "active" ||
      (!optionsOverride.includeTaskRun && conversation.source !== "chat")
    ) {
      throw new NotFoundError("Conversation not found.");
    }

    const agent = await getAgent(conversation.agent_id);
    return { agent, conversation };
  }

  async function getTaskRunConversationRow(
    taskId: string,
    taskRunId: string,
  ): Promise<ConversationRow | undefined> {
    const exact = await options.db.query.conversations.findFirst({
      where: (table, operators) =>
        operators.and(
          operators.eq(table.task_id, taskId),
          operators.eq(table.task_run_id, taskRunId),
          operators.eq(table.status, "active"),
        ),
    });

    if (exact) {
      return exact;
    }

    return options.db.query.conversations.findFirst({
      where: (table, operators) =>
        operators.and(
          operators.eq(table.task_run_id, taskRunId),
          operators.eq(table.status, "active"),
        ),
    });
  }

  function withResolvedWorkspacePath(agent: AgentRow): AgentRuntimeRow {
    return {
      ...agent,
      workspace_path: resolveAgentWorkspacePath({
        config: options.config,
        slug: agent.slug,
        status: agent.status === "archived" ? "archived" : "active",
      }),
    };
  }

  async function createConversation(
    agent: AgentRuntimeRow,
    input: {
      source?: "chat" | "task_run";
      title?: string;
      taskId?: string;
      taskRunId?: string;
      makeCurrent?: boolean;
      permission?: OpenCodeSessionPermissionRule[];
    } = {},
  ): Promise<ConversationRow> {
    const source = input.source ?? "chat";
    const makeCurrent = input.makeCurrent ?? source === "chat";
    const session = await options.opencodeService.createSession(agent.workspace_path, {
      title: input.title,
      permission: input.permission,
    });
    const timestamp = new Date(session.time.updated ?? session.time.created);

    if (makeCurrent) {
      await options.db
        .update(conversations)
        .set({ is_current: false, updated_at: timestamp })
        .where(eq(conversations.agent_id, agent.id));
    }

    const [created] = await options.db
      .insert(conversations)
      .values({
        id: createId(),
        agent_id: agent.id,
        opencode_session_id: session.id,
        title: cleanTitle(session.title) ?? cleanTitle(input.title),
        status: "active",
        source,
        is_current: makeCurrent,
        task_id: input.taskId ?? null,
        task_run_id: input.taskRunId ?? null,
        created_at: new Date(session.time.created),
        updated_at: timestamp,
        converted_at: null,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create conversation.");
    }

    return created;
  }

  async function setCurrentConversation(agentId: string, conversationId: string): Promise<void> {
    await options.db
      .update(conversations)
      .set({ is_current: false })
      .where(eq(conversations.agent_id, agentId));

    await options.db
      .update(conversations)
      .set({ is_current: true })
      .where(eq(conversations.id, conversationId));
  }

  async function syncConversation(
    agent: AgentRuntimeRow,
    conversation: ConversationRow,
  ): Promise<void> {
    const [session, remoteMessages] = await Promise.all([
      options.opencodeService.getSession(agent.workspace_path, conversation.opencode_session_id),
      options.opencodeService.listSessionMessages(
        agent.workspace_path,
        conversation.opencode_session_id,
      ),
    ]);
    const nextMessages = remoteMessages.map((message) =>
      mapRemoteMessage(conversation.id, message),
    );
    const updatedAt = new Date(
      session.time.updated ?? nextMessages.at(-1)?.updatedAtMs ?? conversation.updated_at.getTime(),
    );

    await options.db
      .update(conversations)
      .set({
        title: cleanTitle(session.title),
        updated_at: updatedAt,
      })
      .where(eq(conversations.id, conversation.id));

    await options.db.delete(messages).where(eq(messages.conversation_id, conversation.id));

    if (nextMessages.length === 0) {
      return;
    }

    await options.db.insert(messages).values(
      nextMessages.map((message) => ({
        id: message.id,
        conversation_id: conversation.id,
        role: message.role,
        content: message.content,
        parts_json: JSON.stringify(message.parts),
        attachments_json: JSON.stringify(message.attachments),
        created_at: new Date(message.createdAtMs),
        updated_at: new Date(message.updatedAtMs),
      })),
    );
  }

  async function getSnapshot(agentId: string, currentId: string): Promise<ConversationSnapshot> {
    const current = await getConversationDetail(currentId);
    const previous = (await listConversationSummaries(agentId)).filter(
      (conversation) => conversation.id !== currentId,
    );

    return conversationSnapshotSchema.parse({
      current,
      previous,
    });
  }

  async function getConversationDetail(conversationId: string): Promise<ConversationDetail> {
    const conversation = await options.db.query.conversations.findFirst({
      where: (table, operators) => operators.eq(table.id, conversationId),
    });

    if (!conversation) {
      throw new NotFoundError("Conversation not found.");
    }

    return mapConversationDetail(conversation);
  }

  async function mapConversationDetail(conversation: ConversationRow): Promise<ConversationDetail> {
    const summary = await mapConversationSummary(conversation);
    const rows = await options.db.query.messages.findMany({
      where: (table, operators) => operators.eq(table.conversation_id, conversation.id),
      orderBy: (table, operators) => [operators.asc(table.created_at), operators.asc(table.id)],
    });

    return conversationDetailSchema.parse({
      ...summary,
      messages: rows.map(mapConversationMessage),
    });
  }

  async function listConversationSummaries(agentId: string): Promise<ConversationSummary[]> {
    const rows = await options.db.query.conversations.findMany({
      where: (table, operators) =>
        operators.and(
          operators.eq(table.agent_id, agentId),
          operators.eq(table.status, "active"),
          operators.eq(table.source, "chat"),
        ),
      orderBy: (table) => [desc(table.updated_at), desc(table.created_at)],
    });

    return Promise.all(rows.map((conversation) => mapConversationSummary(conversation)));
  }

  async function mapConversationSummary(
    conversation: ConversationRow,
  ): Promise<ConversationSummary> {
    const rows = await options.db.query.messages.findMany({
      where: (table, operators) => operators.eq(table.conversation_id, conversation.id),
      columns: { id: true },
    });

    return conversationSummarySchema.parse({
      id: conversation.id,
      agentId: conversation.agent_id,
      opencodeSessionId: conversation.opencode_session_id,
      title: cleanTitle(conversation.title),
      status: conversation.status,
      source: conversation.source,
      isCurrent: conversation.is_current,
      taskId: conversation.task_id ?? undefined,
      taskRunId: conversation.task_run_id ?? undefined,
      messageCount: rows.length,
      createdAt: conversation.created_at.toISOString(),
      updatedAt: conversation.updated_at.toISOString(),
      convertedAt: conversation.converted_at?.toISOString(),
    });
  }
}

function parseModel(value: string): { providerID: string; modelID: string } {
  const slash = value.indexOf("/");

  if (slash <= 0 || slash === value.length - 1) {
    throw new Error(`Invalid qualified model '${value}'.`);
  }

  return {
    providerID: value.slice(0, slash),
    modelID: value.slice(slash + 1),
  };
}

const OPENCODE_AGENTS = new Set(["general", "plan", "build", "explore"]);

function resolveOpenCodeAgent(slug: string): string {
  return OPENCODE_AGENTS.has(slug) ? slug : "build";
}

function mapConversationMessage(row: MessageRow): ConversationMessage {
  return conversationMessageSchema.parse({
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    parts: parseJson(row.parts_json, []),
    attachments: parseJson(row.attachments_json, []),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  return JSON.parse(value) as T;
}
