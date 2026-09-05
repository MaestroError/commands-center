import { desc, eq, inArray } from "drizzle-orm";
import type { Logger } from "pino";

import {
  conversationDetailSchema,
  conversationMessageSchema,
  conversationSnapshotSchema,
  conversationSummarySchema,
  sessionMediaListSchema,
  sendConversationCommandInputSchema,
  sendConversationPromptInputSchema,
  sendConversationShellInputSchema,
  specialistCapabilitySelectionSchema,
  taskPermissionProfileSchema,
  systemPromptOverridesSchema,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationMessageError,
  type ConversationSnapshot,
  type ConversationSummary,
  type QuestionItem,
  type ResolvedSystemPrompt,
  type SendConversationCommandInput,
  type SendConversationPromptInput,
  type SendConversationShellInput,
  type SessionMediaItem,
  type SpecialistCapabilitySelection,
  type SystemPromptOverrides,
} from "@cc/shared/schemas";

import { createId } from "../db/ids.js";
import type { AppDb } from "../db/client.js";
import {
  type agents,
  artifact_share_links,
  artifacts,
  conversations,
  messages,
} from "../db/schema/index.js";
import { resolveCompanionPromptOverrides } from "../mcp/cc-managed/group-metadata.js";
import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import {
  cleanTitle,
  extractMediaItems,
  mapRemoteMessage,
  readModelError,
} from "../lib/message-mapper.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { resolveSpecialistWorkspacePath } from "./specialist-workspace.js";
import { OpenCodeRequestError } from "./opencode-service.js";
import type {
  OpenCodePendingPermission,
  OpenCodePendingQuestion,
  OpenCodeService,
  OpenCodeSessionPermissionRule,
  OpenCodeSessionStatus,
} from "./opencode-service.js";
import type { SessionArchiveService } from "./session-archive-service.js";
import type { SessionArchiveSettingsService } from "./session-archive-settings-service.js";
import type { InteractiveChatWatchdogService } from "./interactive-chat-watchdog-service.js";
import { createTaskRunOperationGuard } from "./task-run-operation-guard.js";
import { APP_NAME } from "../system-prompts/constants.js";
import {
  createSystemPromptService,
  type SystemPromptService,
} from "../system-prompts/system-prompt-service.js";
import type { SystemPromptRenderContext, SystemPromptScope } from "../system-prompts/types.js";

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

export type TaskRunPromptStart = {
  conversationId: string;
  opencodeSessionId: string;
  attemptedModel: string;
  baselineMessageCount: number;
  promptAcceptedAt: string;
};

export type PendingChatPermission = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  always: string[];
  metadata: Record<string, unknown>;
  tool?: OpenCodePendingPermission["tool"];
};

export type PendingChatQuestion = {
  id: string;
  sessionID: string;
  questions: QuestionItem[];
  tool?: OpenCodePendingQuestion["tool"];
};

export type PendingChatInteractions = {
  permissions: PendingChatPermission[];
  question: PendingChatQuestion | null;
  questions: PendingChatQuestion[];
};

export type TaskRunPendingInteraction =
  | ({ type: "permission" } & PendingChatPermission)
  | ({ type: "question" } & PendingChatQuestion);

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

const WATCHDOG_RECOVERY_RETRY_DELAYS_MS = [500, 1_000, 2_000] as const;

export function createConversationService(options: {
  db: AppDb;
  config: RuntimeConfig;
  opencodeService: OpenCodeService;
  logger?: Logger;
  archiveService?: SessionArchiveService;
  archiveSettingsService?: SessionArchiveSettingsService;
  systemPromptService?: SystemPromptService;
  interactiveChatWatchdogService?: InteractiveChatWatchdogService;
  watchdogRecoveryRetryDelaysMs?: readonly number[];
  watchdogRecoveryListActiveChats?: () => Promise<ConversationRow[]>;
}) {
  const systemPromptService =
    options.systemPromptService ??
    createSystemPromptService({ config: options.config, logger: options.logger });

  // The composed snapshot for a just-sent user message, keyed by conversation.
  // syncConversation attaches it to the new user message once OpenCode echoes it
  // back (handles both the synchronous and streaming send paths). In-memory:
  // a lost pending snapshot degrades to the modal's "current configuration"
  // fallback, which is acceptable per the portable-workspace rules.
  const pendingSnapshots = new Map<string, ResolvedSystemPrompt[]>();
  const conversationOperationTails = new Map<string, Promise<unknown>>();
  const taskRunOperationGuard = createTaskRunOperationGuard();
  const watchdogRecoveryController = new AbortController();
  const watchdogRecoveryRetryDelaysMs =
    options.watchdogRecoveryRetryDelaysMs ?? WATCHDOG_RECOVERY_RETRY_DELAYS_MS;
  let watchdogRecoveryPromise: Promise<void> | undefined;

  return {
    taskRunOperationGuard,

    resumeInteractiveChatWatchdogs(): Promise<void> {
      if (watchdogRecoveryController.signal.aborted) return Promise.resolve();
      watchdogRecoveryPromise ??= restoreInteractiveChatWatchdogs().finally(() => {
        watchdogRecoveryPromise = undefined;
      });
      return watchdogRecoveryPromise;
    },

    dispose(): void {
      watchdogRecoveryController.abort();
    },

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
      // Task runs compose with defaults — no per-conversation toggles.
      const { system, snapshot } = await composeSystem("task", loaded.agent, loaded.conversation);
      const message = await options.opencodeService.promptSession({
        directory: loaded.agent.workspace_path,
        sessionID: loaded.conversation.opencode_session_id,
        agent: resolveOpenCodeAgent(loaded.agent.slug),
        model,
        text: parsed.text,
        attachments: parsed.attachments,
        system,
      });
      pendingSnapshots.set(loaded.conversation.id, snapshot);
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

    async startTaskRunPrompt(
      conversationId: string,
      input: SendConversationPromptInput,
    ): Promise<TaskRunPromptStart> {
      const parsed = sendConversationPromptInputSchema.parse(input);
      const loaded = await getConversationAgent(conversationId, { includeTaskRun: true });

      if (loaded.conversation.source !== "task_run") {
        throw new BadRequestError("Conversation is not a task run session.");
      }

      const [model, baselineMessages] = await Promise.all([
        resolveRunModel(loaded.agent.workspace_path, parsed.model, loaded.agent.default_model),
        options.opencodeService.listSessionMessages(
          loaded.agent.workspace_path,
          loaded.conversation.opencode_session_id,
        ),
      ]);
      const baselineMessageCount = baselineMessages.length;

      const { system, snapshot } = await composeSystem("task", loaded.agent, loaded.conversation);
      await options.opencodeService.promptSessionAsync({
        directory: loaded.agent.workspace_path,
        sessionID: loaded.conversation.opencode_session_id,
        agent: resolveOpenCodeAgent(loaded.agent.slug),
        model,
        text: parsed.text,
        attachments: parsed.attachments,
        system,
      });
      pendingSnapshots.set(loaded.conversation.id, snapshot);

      return {
        conversationId: loaded.conversation.id,
        opencodeSessionId: loaded.conversation.opencode_session_id,
        attemptedModel: qualifyModel(model),
        baselineMessageCount,
        promptAcceptedAt: new Date().toISOString(),
      };
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

    async syncTaskRunConversation(taskId: string, taskRunId: string): Promise<ConversationDetail> {
      const conversation = await getTaskRunConversationRow(taskId, taskRunId);

      if (!conversation) {
        throw new NotFoundError("Task run session not found.");
      }

      const agent = await getAgent(conversation.agent_id);
      await syncConversation(agent, conversation);
      return getConversationDetail(conversation.id);
    },

    async getTaskRunSessionStatus(
      taskId: string,
      taskRunId: string,
    ): Promise<OpenCodeSessionStatus> {
      const conversation = await getTaskRunConversationRow(taskId, taskRunId);

      if (!conversation) {
        throw new NotFoundError("Task run session not found.");
      }

      const agent = await getAgent(conversation.agent_id);
      return options.opencodeService.getSessionStatus(
        agent.workspace_path,
        conversation.opencode_session_id,
      );
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
      return serializeConversationOperation(conversationId, async () => {
        const loaded = await getConversationAgent(conversationId);
        const watchdog = await prepareInteractiveChatWatchdog(loaded);
        let promptStarted = false;
        try {
          await setCurrentConversation(loaded.agent.id, loaded.conversation.id);
          const { system, snapshot } = await composeSystem(
            "chat",
            loaded.agent,
            loaded.conversation,
            parseOverrides(loaded.conversation),
          );
          const model = await resolveRunModel(
            loaded.agent.workspace_path,
            parsed.model,
            loaded.agent.default_model,
          );
          promptStarted = true;
          watchdog?.arm();
          await options.opencodeService.promptSession({
            directory: loaded.agent.workspace_path,
            sessionID: loaded.conversation.opencode_session_id,
            agent: resolveOpenCodeAgent(loaded.agent.slug),
            model,
            text: parsed.text,
            attachments: parsed.attachments,
            system,
            signal: openCodeRequestSignal(),
          });
          watchdog?.cancel();
          pendingSnapshots.set(loaded.conversation.id, snapshot);
          await syncConversation(loaded.agent, loaded.conversation);
          return getConversationDetail(loaded.conversation.id);
        } catch (error) {
          if (!promptStarted || error instanceof OpenCodeRequestError) {
            watchdog?.cancel();
          }
          throw error;
        }
      });
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
      return serializeConversationOperation(conversationId, async () => {
        const loaded = await getConversationAgent(conversationId);
        const watchdog = await prepareInteractiveChatWatchdog(loaded);

        let promptStarted = false;
        try {
          await setCurrentConversation(loaded.agent.id, loaded.conversation.id);
          const { system, snapshot } = await composeSystem(
            "chat",
            loaded.agent,
            loaded.conversation,
            parseOverrides(loaded.conversation),
          );
          const model = await resolveRunModel(
            loaded.agent.workspace_path,
            parsed.model,
            loaded.agent.default_model,
          );
          promptStarted = true;
          await options.opencodeService.promptSessionAsync({
            directory: loaded.agent.workspace_path,
            sessionID: loaded.conversation.opencode_session_id,
            agent: resolveOpenCodeAgent(loaded.agent.slug),
            model,
            text: parsed.text,
            attachments: parsed.attachments,
            system,
            signal: AbortSignal.timeout(options.config.timeouts.opencodeRequestMs),
          });
          // Streaming send does not sync here; the snapshot is attached by the next
          // syncConversation once OpenCode echoes the user message back.
          pendingSnapshots.set(loaded.conversation.id, snapshot);
          watchdog?.arm();
        } catch (error) {
          if (promptStarted && !(error instanceof OpenCodeRequestError)) {
            watchdog?.arm();
          } else {
            watchdog?.cancel();
          }
          throw error;
        }
      });
    },

    async resolveConversationAgent(conversationId: string) {
      return getConversationAgent(conversationId);
    },

    // Resolved system prompts for a conversation, with its overrides applied —
    // powers the chat sidebar tab.
    async getConversationSystemPrompts(conversationId: string): Promise<ResolvedSystemPrompt[]> {
      const loaded = await getConversationAgent(conversationId, { includeTaskRun: true });
      return systemPromptService.listResolved(
        scopeFor(loaded.conversation),
        buildSystemContext(loaded.agent, loaded.conversation),
        await withCompanionOverrides(
          loaded.agent,
          loaded.conversation,
          parseOverrides(loaded.conversation),
        ),
      );
    },

    // Flip a single prompt's enabled override for a conversation and return the
    // updated resolved list.
    async setConversationSystemPromptEnabled(
      conversationId: string,
      promptId: string,
      enabled: boolean,
    ): Promise<ResolvedSystemPrompt[]> {
      const loaded = await getConversationAgent(conversationId, { includeTaskRun: true });
      const scope = scopeFor(loaded.conversation);
      const definition = systemPromptService
        .listDefinitions()
        .find(
          (entry) => entry.id === promptId && (entry.scope === scope || entry.scope === "both"),
        );
      if (!definition) {
        throw new NotFoundError(`System prompt "${promptId}" does not apply to this conversation.`);
      }
      if (definition.capabilityControlled) {
        throw new BadRequestError(
          `System prompt "${promptId}" is controlled by its MCP group and cannot be toggled manually.`,
        );
      }

      const nextOverrides: SystemPromptOverrides = {
        ...(parseOverrides(loaded.conversation) ?? {}),
        [promptId]: enabled,
      };
      await options.db
        .update(conversations)
        .set({ system_prompt_overrides_json: JSON.stringify(nextOverrides) })
        .where(eq(conversations.id, conversationId));

      return systemPromptService.listResolved(
        scope,
        buildSystemContext(loaded.agent, loaded.conversation),
        await withCompanionOverrides(loaded.agent, loaded.conversation, nextOverrides),
      );
    },

    async replyPermission(
      conversationId: string,
      requestId: string,
      reply: "once" | "always" | "reject",
    ): Promise<void> {
      const loaded = await getConversationAgent(conversationId);
      const signal = openCodeRequestSignal();
      const [permissions, sessionIDs] = await Promise.all([
        options.opencodeService.listPendingPermissions(loaded.agent.workspace_path, signal),
        options.opencodeService.getSessionTreeIds(
          loaded.agent.workspace_path,
          loaded.conversation.opencode_session_id,
          signal,
        ),
      ]);
      const request = permissions.find((permission) => permission.id === requestId);
      if (!request || !sessionIDs.has(request.sessionID)) {
        throw new NotFoundError(`Pending request "${requestId}" no longer exists.`);
      }
      await options.opencodeService.replyPermission(
        loaded.agent.workspace_path,
        requestId,
        reply,
        signal,
      );
    },

    async replyQuestion(
      conversationId: string,
      requestId: string,
      answers: string[][],
    ): Promise<void> {
      const loaded = await getConversationAgent(conversationId);
      const signal = openCodeRequestSignal();
      await verifyPendingQuestion(loaded, requestId, signal);
      await options.opencodeService.replyQuestion(
        loaded.agent.workspace_path,
        requestId,
        answers,
        signal,
      );
    },

    async rejectQuestion(conversationId: string, requestId: string): Promise<void> {
      const loaded = await getConversationAgent(conversationId);
      const signal = openCodeRequestSignal();
      await verifyPendingQuestion(loaded, requestId, signal);
      await options.opencodeService.rejectQuestion(loaded.agent.workspace_path, requestId, signal);
    },

    async abortConversation(conversationId: string): Promise<void> {
      return serializeConversationOperation(conversationId, async () => {
        const loaded = await getConversationAgent(conversationId);
        await options.opencodeService.abortSession(
          loaded.agent.workspace_path,
          loaded.conversation.opencode_session_id,
          openCodeRequestSignal(),
        );
        options.interactiveChatWatchdogService?.cancel(loaded.conversation.id);
      });
    },

    async abortTaskRunConversation(taskId: string, taskRunId: string): Promise<void> {
      const conversation = await getTaskRunConversationRow(taskId, taskRunId);

      if (!conversation) {
        throw new NotFoundError("Task run session not found.");
      }

      const agent = await getAgent(conversation.agent_id);
      await options.opencodeService.abortSession(
        agent.workspace_path,
        conversation.opencode_session_id,
      );
    },

    async listTaskRunPendingInteractions(
      taskId: string,
      taskRunId: string,
    ): Promise<TaskRunPendingInteraction[]> {
      const conversation = await getTaskRunConversationRow(taskId, taskRunId);

      if (!conversation) {
        throw new NotFoundError("Task run session not found.");
      }

      const agent = await getAgent(conversation.agent_id);
      const signal = openCodeRequestSignal();
      const [permissions, questions, run] = await Promise.all([
        options.opencodeService.listPendingPermissions(agent.workspace_path, signal),
        options.opencodeService.listPendingQuestions(agent.workspace_path, signal),
        options.db.query.task_runs.findFirst({
          where: (table, operators) => operators.eq(table.id, taskRunId),
          columns: { effective_permissions_json: true },
        }),
      ]);
      const sessionIDs = await options.opencodeService.getSessionTreeIds(
        agent.workspace_path,
        conversation.opencode_session_id,
        signal,
      );
      const unresolvedPermissions: OpenCodePendingPermission[] = [];
      for (const permission of permissions.filter((candidate) =>
        sessionIDs.has(candidate.sessionID),
      )) {
        if (!hasFrozenAutoApprovePolicy(run?.effective_permissions_json)) {
          unresolvedPermissions.push(permission);
          continue;
        }
        try {
          const replied = await taskRunOperationGuard.runExclusive(taskRunId, async () => {
            if (taskRunOperationGuard.isCancellationRequested(taskRunId)) return false;

            const currentRun = await options.db.query.task_runs.findFirst({
              where: (table, operators) => operators.eq(table.id, taskRunId),
              columns: { task_id: true, status: true },
            });
            if (
              taskRunOperationGuard.isCancellationRequested(taskRunId) ||
              currentRun?.task_id !== taskId ||
              currentRun.status !== "running"
            ) {
              return false;
            }

            await options.opencodeService.replyPermission(
              agent.workspace_path,
              permission.id,
              "once",
              signal,
            );
            return true;
          });
          if (!replied) continue;
        } catch (error) {
          if (error instanceof NotFoundError) continue;
          let unresolvedPermission = permission;
          try {
            const reconciliationSignal = openCodeRequestSignal();
            const [currentPermissions, currentSessionIDs] = await Promise.all([
              options.opencodeService.listPendingPermissions(
                agent.workspace_path,
                reconciliationSignal,
              ),
              options.opencodeService.getSessionTreeIds(
                agent.workspace_path,
                conversation.opencode_session_id,
                reconciliationSignal,
              ),
            ]);
            const currentPermission = currentPermissions.find(
              (candidate) => candidate.id === permission.id,
            );
            if (!currentPermission || !currentSessionIDs.has(currentPermission.sessionID)) continue;
            unresolvedPermission = currentPermission;
          } catch (reconciliationError) {
            options.logger?.warn(
              {
                err: reconciliationError,
                taskId,
                taskRunId,
                requestId: permission.id,
                sessionID: permission.sessionID,
              },
              "failed to reconcile task-run permission after auto-approval failure",
            );
          }
          options.logger?.warn(
            {
              err: error,
              taskId,
              taskRunId,
              requestId: permission.id,
              sessionID: permission.sessionID,
            },
            "failed to auto-approve task-run permission; surfacing for review",
          );
          unresolvedPermissions.push(unresolvedPermission);
        }
      }

      return [
        ...unresolvedPermissions.map(
          (permission): TaskRunPendingInteraction => ({
            type: "permission",
            ...mapPendingPermission(permission),
          }),
        ),
        ...questions
          .filter((question) => sessionIDs.has(question.sessionID))
          .map(
            (question): TaskRunPendingInteraction => ({
              type: "question",
              ...mapPendingQuestion(question),
            }),
          ),
      ];
    },

    // Rehydrates pending permissions/question for a chat conversation. Unlike
    // the SSE stream (which only reaches a subscribed browser tab), this reads
    // straight from OpenCode's own pending-request state, so it reflects
    // reality even after the user navigated away and came back.
    async listPendingInteractions(conversationId: string): Promise<PendingChatInteractions> {
      const loaded = await getConversationAgent(conversationId);
      const signal = openCodeRequestSignal();
      const [permissions, questions] = await Promise.all([
        options.opencodeService.listPendingPermissions(loaded.agent.workspace_path, signal),
        options.opencodeService.listPendingQuestions(loaded.agent.workspace_path, signal),
      ]);
      const sessionIDs = await options.opencodeService.getSessionTreeIds(
        loaded.agent.workspace_path,
        loaded.conversation.opencode_session_id,
        signal,
      );

      const pendingQuestions = questions
        .filter((question) => sessionIDs.has(question.sessionID))
        .map(mapPendingQuestion);

      return {
        permissions: permissions
          .filter((permission) => sessionIDs.has(permission.sessionID))
          .map(mapPendingPermission),
        question: pendingQuestions[0] ?? null,
        questions: pendingQuestions,
      };
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
      return serializeConversationOperation(conversationId, async () => {
        const agent = await getAgent(agentId);
        const conversation = await options.db.query.conversations.findFirst({
          where: (table, ops) =>
            ops.and(ops.eq(table.id, conversationId), ops.eq(table.agent_id, agent.id)),
        });

        if (!conversation) throw new NotFoundError("Conversation not found.");

        if (conversation.source === "task_run" && !conversation.converted_at) {
          throw new BadRequestError(
            "Task run sessions cannot be deleted from normal chat history.",
          );
        }

        // Best-effort: delete from OpenCode (session may already be gone)
        try {
          await options.opencodeService.deleteSession(
            agent.workspace_path,
            conversation.opencode_session_id,
            openCodeRequestSignal(),
          );
        } catch {
          // ignore
        }

        await removeConversationArchive(agent, conversation);

        // Delete dependents before the conversation row. Artifacts (and their
        // share links) carry NOT NULL foreign keys to conversations.id, so with
        // foreign_keys=ON the conversation delete throws a constraint error unless
        // they are removed first. Task-run sessions opened in chat commonly carry
        // artifacts, which is why they failed to delete. The artifact ids are read
        // inside the transaction so a concurrent insert can't slip a new dependent
        // in between the read and the deletes.
        options.db.transaction((tx) => {
          const artifactIds = tx
            .select({ id: artifacts.id })
            .from(artifacts)
            .where(eq(artifacts.conversation_id, conversation.id))
            .all()
            .map((row) => row.id);

          if (artifactIds.length > 0) {
            tx.delete(artifact_share_links)
              .where(inArray(artifact_share_links.artifact_id, artifactIds))
              .run();
            tx.delete(artifacts).where(inArray(artifacts.id, artifactIds)).run();
          }
          tx.delete(messages).where(eq(messages.conversation_id, conversation.id)).run();
          tx.delete(conversations).where(eq(conversations.id, conversation.id)).run();
        });
        pendingSnapshots.delete(conversation.id);
        options.interactiveChatWatchdogService?.cancel(conversation.id);
      });
    },
  };

  async function restoreInteractiveChatWatchdogs(): Promise<void> {
    const watchdog = options.interactiveChatWatchdogService;
    const signal = watchdogRecoveryController.signal;
    if (!watchdog || signal.aborted) return;

    let activeChats: Awaited<ReturnType<typeof options.db.query.conversations.findMany>>;
    for (let attempt = 0; ; attempt += 1) {
      try {
        activeChats = options.watchdogRecoveryListActiveChats
          ? await options.watchdogRecoveryListActiveChats()
          : await options.db.query.conversations.findMany({
              where: (table, operators) =>
                operators.and(
                  operators.eq(table.status, "active"),
                  operators.eq(table.source, "chat"),
                ),
            });
        break;
      } catch (error) {
        if (signal.aborted) return;
        const nextDelayMs = watchdogRecoveryDelay(attempt);
        options.logger?.warn(
          { err: error, attempt: attempt + 1, nextDelayMs },
          "interactive chat watchdog restart scan failed; retrying",
        );
        if (!(await waitForAbortableDelay(nextDelayMs, signal))) return;
      }
    }

    let pending = activeChats;
    for (let attempt = 0; pending.length > 0; attempt += 1) {
      const nextDelayMs = watchdogRecoveryDelay(attempt);
      const outcomes = await Promise.all(
        pending.map(async (conversation) => {
          let retryConversation = conversation;
          try {
            const currentConversation = await options.db.query.conversations.findFirst({
              where: (table, operators) =>
                operators.and(
                  operators.eq(table.id, conversation.id),
                  operators.eq(table.status, "active"),
                  operators.eq(table.source, "chat"),
                ),
            });
            if (!currentConversation || signal.aborted) return undefined;
            retryConversation = currentConversation;
            const agent = await options.db.query.agents.findFirst({
              where: (table, operators) => operators.eq(table.id, currentConversation.agent_id),
            });
            if (signal.aborted || !agent || agent.status !== "active") return undefined;
            const directory = withResolvedWorkspacePath(agent).workspace_path;
            const status = await options.opencodeService.getSessionStatus(
              directory,
              currentConversation.opencode_session_id,
              watchdogRecoveryRequestSignal(signal),
            );
            if (signal.aborted || (status.type !== "busy" && status.type !== "retry")) {
              return undefined;
            }
            await watchdog.rearm({
              conversationId: currentConversation.id,
              directory,
              sessionID: currentConversation.opencode_session_id,
              signal: watchdogRecoveryRequestSignal(signal),
            });
            return undefined;
          } catch (error) {
            if (signal.aborted) return undefined;
            options.logger?.warn(
              {
                err: error,
                conversationId: conversation.id,
                sessionID: conversation.opencode_session_id,
                attempt: attempt + 1,
                nextDelayMs,
              },
              "interactive chat watchdog restart recovery failed; retrying",
            );
            return { conversation: retryConversation, error };
          }
        }),
      );
      const failures = outcomes.filter((outcome) => outcome !== undefined);
      if (failures.length === 0 || signal.aborted) return;
      pending = failures.map(({ conversation }) => conversation);
      if (!(await waitForAbortableDelay(nextDelayMs, signal))) return;
    }
  }

  function watchdogRecoveryDelay(attempt: number): number {
    return (
      watchdogRecoveryRetryDelaysMs[Math.min(attempt, watchdogRecoveryRetryDelaysMs.length - 1)] ??
      WATCHDOG_RECOVERY_RETRY_DELAYS_MS.at(-1)!
    );
  }

  function watchdogRecoveryRequestSignal(signal: AbortSignal): AbortSignal {
    return AbortSignal.any([
      signal,
      AbortSignal.timeout(options.config.timeouts.opencodeRequestMs),
    ]);
  }

  function openCodeRequestSignal(): AbortSignal {
    return AbortSignal.timeout(options.config.timeouts.opencodeRequestMs);
  }

  function waitForAbortableDelay(delayMs: number, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
      const finish = (completed: boolean): void => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve(completed);
      };
      const onAbort = (): void => finish(false);
      const timer = setTimeout(() => finish(true), delayMs);
      timer.unref?.();
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  function hasFrozenAutoApprovePolicy(value: string | null | undefined): boolean {
    if (!value) return false;
    try {
      const parsed = taskPermissionProfileSchema.safeParse(JSON.parse(value));
      return parsed.success && parsed.data.approvalPolicy === "auto_approve";
    } catch {
      return false;
    }
  }

  function serializeConversationOperation<T>(
    conversationId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = conversationOperationTails.get(conversationId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    conversationOperationTails.set(conversationId, current);
    const clear = () => {
      if (conversationOperationTails.get(conversationId) === current) {
        conversationOperationTails.delete(conversationId);
      }
    };
    void current.then(clear, clear);
    return current;
  }

  async function verifyPendingQuestion(
    loaded: Awaited<ReturnType<typeof getConversationAgent>>,
    requestId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const [questions, sessionIDs] = await Promise.all([
      options.opencodeService.listPendingQuestions(loaded.agent.workspace_path, signal),
      options.opencodeService.getSessionTreeIds(
        loaded.agent.workspace_path,
        loaded.conversation.opencode_session_id,
        signal,
      ),
    ]);
    const request = questions.find((question) => question.id === requestId);
    if (!request || !sessionIDs.has(request.sessionID)) {
      throw new NotFoundError(`Pending request "${requestId}" no longer exists.`);
    }
  }

  async function prepareInteractiveChatWatchdog(
    loaded: Awaited<ReturnType<typeof getConversationAgent>>,
  ) {
    const watchdogInput = {
      conversationId: loaded.conversation.id,
      directory: loaded.agent.workspace_path,
      sessionID: loaded.conversation.opencode_session_id,
    };
    return options.interactiveChatWatchdogService
      ?.prepare(watchdogInput)
      .catch(async (error: unknown) => {
        options.logger?.warn(
          { err: error, conversationId: loaded.conversation.id },
          "interactive chat watchdog preparation failed",
        );
        return options.interactiveChatWatchdogService?.prepareFallback(watchdogInput);
      });
  }

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

  function scopeFor(conversation: ConversationRow): SystemPromptScope {
    return conversation.source === "task_run" ? "task" : "chat";
  }

  function buildSystemContext(
    agent: AgentRuntimeRow,
    conversation: ConversationRow,
  ): SystemPromptRenderContext {
    const isTaskRun = conversation.source === "task_run";
    return {
      appName: APP_NAME,
      currentDate: new Date().toISOString().slice(0, 10),
      workspaceDir: options.config.paths.workspaceDir,
      specialistDir: agent.workspace_path,
      conversationId: conversation.id,
      specialist: {
        name: agent.name,
        slug: agent.slug,
        role: agent.role,
        instructions: agent.instructions,
      },
      task: isTaskRun
        ? {
            id: conversation.task_id ?? "",
            title: conversation.title ?? "",
            runId: conversation.task_run_id ?? "",
          }
        : undefined,
    };
  }

  function parseOverrides(conversation: ConversationRow): SystemPromptOverrides | undefined {
    if (!conversation.system_prompt_overrides_json) {
      return undefined;
    }
    try {
      const parsed = systemPromptOverridesSchema.safeParse(
        JSON.parse(conversation.system_prompt_overrides_json),
      );
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }

  // Resolve the prompts for a conversation, returning both the `system` string
  // to forward to OpenCode and the snapshot (exactly the prompts that were
  // sent) to persist on the user message.
  async function composeSystem(
    scope: SystemPromptScope,
    agent: AgentRuntimeRow,
    conversation: ConversationRow,
    baseOverrides?: SystemPromptOverrides,
  ): Promise<{ system: string | undefined; snapshot: ResolvedSystemPrompt[] }> {
    const ctx = buildSystemContext(agent, conversation);
    const overrides = await withCompanionOverrides(agent, conversation, baseOverrides);
    const resolved = await systemPromptService.listResolved(scope, ctx, overrides);
    const sent = resolved.filter(
      (prompt) => prompt.enabled && prompt.renderedBody.trim().length > 0,
    );
    const system = sent.map((prompt) => prompt.renderedBody).join("\n\n");
    return { system: system.length > 0 ? system : undefined, snapshot: sent };
  }

  // Companion instruction prompts are capability-driven: enabled exactly when
  // their MCP group is enabled for this specialist. These overrides win over any
  // per-conversation toggle, since operators cannot manually flip them.
  async function withCompanionOverrides(
    agent: AgentRuntimeRow,
    conversation: ConversationRow,
    baseOverrides?: SystemPromptOverrides,
  ): Promise<SystemPromptOverrides> {
    const selection = await resolveEffectiveAppMcpSelection(agent, conversation);
    return { ...(baseOverrides ?? {}), ...resolveCompanionPromptOverrides(selection) };
  }

  // The MCP-group selection that actually applies. For task runs this is the
  // run's frozen effective permissions (a task profile can restrict groups);
  // for chat (and as a fallback) it is the specialist's base capabilities.
  async function resolveEffectiveAppMcpSelection(
    agent: AgentRuntimeRow,
    conversation: ConversationRow,
  ): Promise<{ appMcpServers?: SpecialistCapabilitySelection["appMcpServers"] }> {
    if (conversation.source === "task_run" && conversation.task_run_id) {
      const run = await options.db.query.task_runs.findFirst({
        where: (table, operators) => operators.eq(table.id, conversation.task_run_id ?? ""),
        columns: { effective_permissions_json: true },
      });
      if (run?.effective_permissions_json) {
        // Guard JSON.parse so a malformed stored value falls back to agent
        // capabilities instead of breaking system-prompt composition.
        try {
          const parsed = taskPermissionProfileSchema.safeParse(
            JSON.parse(run.effective_permissions_json),
          );
          if (parsed.success) {
            return { appMcpServers: parsed.data.appMcpServers };
          }
        } catch {
          // Fall through to agent capabilities below.
        }
      }
    }

    try {
      return specialistCapabilitySelectionSchema.parse(JSON.parse(agent.capabilities_json));
    } catch {
      return {};
    }
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

    // Messages are rebuilt from OpenCode on every sync, so capture existing
    // snapshots (keyed by the stable OpenCode message id) before the delete and
    // re-apply them on reinsert; otherwise they would be lost each sync.
    const existingSnapshots = new Map<string, string | null>();
    const priorRows = await options.db.query.messages.findMany({
      where: (table, operators) => operators.eq(table.conversation_id, conversation.id),
      columns: { id: true, system_prompt_snapshot_json: true },
    });
    for (const row of priorRows) {
      existingSnapshots.set(row.id, row.system_prompt_snapshot_json);
    }

    await options.db.delete(messages).where(eq(messages.conversation_id, conversation.id));

    if (nextMessages.length === 0) {
      return;
    }

    // Attach the pending snapshot to the newest user message that OpenCode has
    // not echoed before (i.e. the one we just sent).
    const pendingSnapshot = pendingSnapshots.get(conversation.id);
    let snapshotTargetId: string | undefined;
    if (pendingSnapshot) {
      const newUserMessage = [...nextMessages]
        .reverse()
        .find((message) => message.role === "user" && !existingSnapshots.has(message.id));
      snapshotTargetId = newUserMessage?.id;
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
        tokens_json: message.tokens ? JSON.stringify(message.tokens) : null,
        cost: message.cost ?? null,
        model_id: message.modelId ?? null,
        provider_id: message.providerId ?? null,
        system_prompt_snapshot_json: existingSnapshots.has(message.id)
          ? existingSnapshots.get(message.id)
          : message.id === snapshotTargetId && pendingSnapshot
            ? JSON.stringify(pendingSnapshot)
            : null,
        created_at: new Date(message.createdAtMs),
        updated_at: new Date(message.updatedAtMs),
      })),
    );

    if (snapshotTargetId) {
      pendingSnapshots.delete(conversation.id);
    }
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

function mapPendingPermission(permission: OpenCodePendingPermission): PendingChatPermission {
  return {
    id: permission.id,
    sessionID: permission.sessionID,
    permission: permission.permission,
    patterns: permission.patterns,
    always: permission.always,
    metadata: permission.metadata,
    ...(permission.tool ? { tool: permission.tool } : {}),
  };
}

function mapPendingQuestion(question: OpenCodePendingQuestion): PendingChatQuestion {
  return {
    id: question.id,
    sessionID: question.sessionID,
    // OpenCode's pending-question payload is only loosely typed (arbitrary
    // records); it's expected to already match the question/options shape
    // the frontend renders, same assumption the `question.asked` SSE mapper
    // makes (packages/backend/src/services/opencode-event-service.ts).
    questions: question.questions as unknown as QuestionItem[],
    ...(question.tool ? { tool: question.tool } : {}),
  };
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
    tokens: parseJson(row.tokens_json, undefined),
    cost: row.cost ?? undefined,
    modelId: row.model_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    systemPromptSnapshot: parseJson(row.system_prompt_snapshot_json, undefined),
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
