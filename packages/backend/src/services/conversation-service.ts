import { desc, eq } from "drizzle-orm";
import type { Logger } from "pino";

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
import {
  specialistCapabilitySelectionSchema,
  type ConversationMessageError,
} from "@cc/shared/schemas";

import { createId } from "../db/ids.js";
import type { AppDb } from "../db/client.js";
import { type agents, conversations, messages } from "../db/schema/index.js";
import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import {
  cleanTitle,
  extractMediaItems,
  mapRemoteMessage,
  readModelError,
} from "../lib/message-mapper.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import {
  getBuiltInSkillRoot,
  getWorkspaceSkillRoot,
  resolveSpecialistWorkspacePath,
} from "./specialist-workspace.js";
import type { OpenCodeService, OpenCodeSessionPermissionRule } from "./opencode-service.js";
import type { SessionArchiveService } from "./session-archive-service.js";
import type { SessionArchiveSettingsService } from "./session-archive-settings-service.js";
import { createCcManagedMcpAuthStateStore } from "../mcp/cc-managed/auth-state-store.js";
import { createCcManagedMcpAuthTokenService } from "../mcp/cc-managed/auth-token-service.js";
import { createCustomToolService } from "./custom-tool-service.js";
import { createCcManagedMcpServerRegistry } from "../mcp/cc-managed/server-registry.js";
import { createCcManagedMcpToolAccessService } from "../mcp/cc-managed/tool-access-service.js";
import { createCcManagedMcpWorkspaceEntryService } from "../mcp/cc-managed/workspace-entry-service.js";
import { writeOpenCodeWorkspace } from "../opencode/workspace-contract.js";

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

export class TaskRunPromptError extends Error {
  readonly modelError: ConversationMessageError;
  readonly attemptedModel: string;

  constructor(input: { modelError: ConversationMessageError; attemptedModel: string }) {
    super(input.modelError.message);
    this.name = "TaskRunPromptError";
    this.modelError = input.modelError;
    this.attemptedModel = input.attemptedModel;
  }
}

export function createConversationService(options: {
  db: AppDb;
  config: RuntimeConfig;
  opencodeService: OpenCodeService;
  logger?: Logger;
  archiveService?: SessionArchiveService;
  archiveSettingsService?: SessionArchiveSettingsService;
}) {
  const appMcpWorkspaceEntryService = createCcManagedMcpWorkspaceEntryService({
    config: options.config,
    authTokenService: createCcManagedMcpAuthTokenService({
      authStateStore: createCcManagedMcpAuthStateStore(options.config),
    }),
    toolAccessService: createCcManagedMcpToolAccessService(),
    registry: createCcManagedMcpServerRegistry({
      customToolService: createCustomToolService({
        db: options.db,
        config: options.config,
        opencodeService: options.opencodeService,
      }),
    }),
  });

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

    // Owner-scoped listing for self-history tools. Unlike `list`, this includes
    // task-run sessions and supports a source filter and a capped limit.
    async listForAgent(
      agentId: string,
      query: { limit?: number; source?: "chat" | "task_run" | "all" } = {},
    ): Promise<ConversationSummary[]> {
      const limit = Math.min(Math.max(query.limit ?? 10, 1), 50);
      const source = query.source ?? "all";
      const rows = await options.db.query.conversations.findMany({
        where: (table, ops) => {
          const conditions = [ops.eq(table.agent_id, agentId), ops.eq(table.status, "active")];

          if (source !== "all") {
            conditions.push(ops.eq(table.source, source));
          }

          return ops.and(...conditions);
        },
        orderBy: (table) => [desc(table.updated_at), desc(table.created_at)],
        limit,
      });

      return Promise.all(rows.map((conversation) => mapConversationSummary(conversation)));
    },

    // Owner-scoped single-summary lookup. Returns undefined when the conversation
    // does not exist or is owned by another specialist.
    async getSummaryForAgent(
      agentId: string,
      conversationId: string,
    ): Promise<ConversationSummary | undefined> {
      const conversation = await options.db.query.conversations.findFirst({
        where: (table, ops) =>
          ops.and(ops.eq(table.id, conversationId), ops.eq(table.agent_id, agentId)),
      });

      return conversation ? mapConversationSummary(conversation) : undefined;
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
      await enableTaskRunAppMcpEntries(agent, input.permission ?? []);
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

      const model = await resolveRunModel(
        loaded.agent.workspace_path,
        parsed.model,
        loaded.agent.default_model,
      );
      const message = await options.opencodeService.promptSession({
        directory: loaded.agent.workspace_path,
        sessionID: loaded.conversation.opencode_session_id,
        agent: resolveOpenCodeAgent(loaded.agent.slug),
        model,
        text: parsed.text,
        attachments: parsed.attachments,
      });
      const modelError = readModelError(message);
      if (modelError) {
        throw new TaskRunPromptError({
          modelError,
          attemptedModel: qualifyModel(model),
        });
      }
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
        model: await resolveRunModel(
          loaded.agent.workspace_path,
          parsed.model,
          loaded.agent.default_model,
        ),
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
        model: await resolveRunModel(
          loaded.agent.workspace_path,
          parsed.model,
          loaded.agent.default_model,
        ),
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

      await removeConversationArchive(agent, conversation);

      await options.db.delete(messages).where(eq(messages.conversation_id, conversation.id));
      await options.db.delete(conversations).where(eq(conversations.id, conversation.id));
    },
  };

  async function archiveConversation(
    agent: AgentRuntimeRow,
    conversation: ConversationRow,
    conversationMessages: ConversationMessage[],
  ): Promise<void> {
    const archiveService = options.archiveService;

    if (!archiveService) {
      return;
    }

    try {
      const settings = await options.archiveSettingsService?.get();

      if (settings && !settings.sessionArchiveEnabled) {
        return;
      }

      const appendMode = settings?.sessionArchiveAppendMode ?? "debounced";
      const specialist = { id: agent.id, slug: agent.slug, name: agent.name };
      const title = conversation.title ?? null;
      let archivePath: string;

      if (conversation.source === "task_run" && conversation.task_id && conversation.task_run_id) {
        await archiveService.ensureTaskRunArchive({
          specialist,
          conversationId: conversation.id,
          opencodeSessionId: conversation.opencode_session_id,
          taskId: conversation.task_id,
          taskRunId: conversation.task_run_id,
          title,
        });
        archivePath = archiveService.resolveTaskRunArchivePath({
          agentId: agent.id,
          taskId: conversation.task_id,
          taskRunId: conversation.task_run_id,
        });
      } else {
        await archiveService.ensureChatArchive({
          specialist,
          conversationId: conversation.id,
          opencodeSessionId: conversation.opencode_session_id,
          title,
        });
        archivePath = archiveService.resolveChatArchivePath({
          agentId: agent.id,
          conversationId: conversation.id,
        });
      }

      if (appendMode === "off" || conversationMessages.length === 0) {
        return;
      }

      archiveService.enqueueMessages({ archivePath, messages: conversationMessages });
    } catch (error) {
      options.logger?.warn(
        { err: error, conversationId: conversation.id },
        "session archive update failed",
      );
    }
  }

  async function removeConversationArchive(
    agent: AgentRuntimeRow,
    conversation: ConversationRow,
  ): Promise<void> {
    const archiveService = options.archiveService;

    if (!archiveService) {
      return;
    }

    try {
      const archivePath =
        conversation.source === "task_run" && conversation.task_id && conversation.task_run_id
          ? archiveService.resolveTaskRunArchivePath({
              agentId: agent.id,
              taskId: conversation.task_id,
              taskRunId: conversation.task_run_id,
            })
          : archiveService.resolveChatArchivePath({
              agentId: agent.id,
              conversationId: conversation.id,
            });
      await archiveService.removeArchive({ archivePath });
    } catch (error) {
      options.logger?.warn(
        { err: error, conversationId: conversation.id },
        "session archive removal failed",
      );
    }
  }

  async function getAgent(agentId: string): Promise<AgentRuntimeRow> {
    const agent = await options.db.query.agents.findFirst({
      where: (table, operators) => operators.eq(table.id, agentId),
    });

    if (!agent || agent.status !== "active") {
      throw new NotFoundError("Specialist not found.");
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

  // Resolve the qualified model to use for a task run: the requested model if it
  // is still available for the agent's workspace, otherwise the agent default.
  async function resolveRunModel(
    directory: string,
    requested: string | undefined,
    fallbackQualified: string,
  ): Promise<{ providerID: string; modelID: string }> {
    if (!requested || requested === fallbackQualified) {
      return parseModel(fallbackQualified);
    }

    try {
      const providers = await options.opencodeService.listProviders(directory);
      const available = new Set(
        providers.all
          .filter((provider) => providers.connected.includes(provider.id))
          .flatMap((provider) =>
            Object.keys(provider.models ?? {}).map((modelId) => `${provider.id}/${modelId}`),
          ),
      );

      if (available.has(requested)) {
        return parseModel(requested);
      }
    } catch {
      // Provider lookup failed — fall back to the agent default.
    }

    return parseModel(fallbackQualified);
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
      workspace_path: resolveSpecialistWorkspacePath({
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

    const nextTitle = cleanTitle(session.title);
    await options.db
      .update(conversations)
      .set({
        title: nextTitle,
        updated_at: updatedAt,
      })
      .where(eq(conversations.id, conversation.id));

    const archiveMessages: ConversationMessage[] = nextMessages.map(
      ({ createdAtMs: _createdAtMs, updatedAtMs: _updatedAtMs, ...message }) => message,
    );
    await archiveConversation(
      agent,
      { ...conversation, title: nextTitle ?? conversation.title },
      archiveMessages,
    );

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
        error_json: message.error ? JSON.stringify(message.error) : null,
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

  async function enableTaskRunAppMcpEntries(
    agent: AgentRuntimeRow,
    permission: OpenCodeSessionPermissionRule[],
  ): Promise<void> {
    const enabledServerNames = permission.flatMap((rule) =>
      rule.permission.endsWith("_*") ? [rule.permission.slice(0, -2)] : [],
    );

    if (enabledServerNames.length === 0) {
      return;
    }

    const capabilities = specialistCapabilitySelectionSchema.parse(
      JSON.parse(agent.capabilities_json),
    );
    const appMcpEntries = await appMcpWorkspaceEntryService.buildEntriesWithOverrides({
      slug: agent.slug,
      capabilities,
      enabledServerNames,
      contextMode: "task_run",
    });

    await writeOpenCodeWorkspace({
      workspacePath: agent.workspace_path,
      input: {
        name: agent.name,
        role: agent.role,
        instructions: agent.instructions,
        defaultModel: agent.default_model,
        capabilities,
        appMcpEntries,
      },
      skillRoot: getBuiltInSkillRoot(options.config),
      workspaceSkillRoot: getWorkspaceSkillRoot(options.config),
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

function qualifyModel(model: { providerID: string; modelID: string }): string {
  return `${model.providerID}/${model.modelID}`;
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
    error: parseJson(row.error_json, undefined),
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
