import { desc, eq } from "drizzle-orm";

import {
  conversationAttachmentSchema,
  conversationDetailSchema,
  conversationMessageSchema,
  conversationSnapshotSchema,
  conversationSummarySchema,
  sendConversationCommandInputSchema,
  sendConversationPromptInputSchema,
  sendConversationShellInputSchema,
  type ConversationAttachment,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationSnapshot,
  type ConversationSummary,
  type SendConversationCommandInput,
  type SendConversationPromptInput,
  type SendConversationShellInput,
} from "../schemas/conversations.js";

import { createId } from "../db/ids.js";
import type { AppDb } from "../db/client.js";
import { type agents, conversations, messages } from "../db/schema/index.js";
import { NotFoundError } from "../lib/api-error.js";
import type { OpenCodeService, OpenCodeSessionMessage } from "./opencode-service.js";

type AgentRow = typeof agents.$inferSelect;
type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

export type ConversationService = ReturnType<typeof createConversationService>;

export function createConversationService(options: {
  db: AppDb;
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
      return mapConversationDetail(conversation);
    },

    async startFresh(agentId: string): Promise<ConversationSnapshot> {
      const agent = await getAgent(agentId);
      const created = await createConversation(agent);
      return getSnapshot(agent.id, created.id);
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
        agent: loaded.agent.slug,
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
        agent: loaded.agent.slug,
        model: loaded.agent.default_model,
        command: parsed.command,
        arguments: parsed.arguments,
        attachments: parsed.attachments,
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
        agent: loaded.agent.slug,
        model: parseModel(loaded.agent.default_model),
        command: parsed.command,
      });
      await syncConversation(loaded.agent, loaded.conversation);
      return getConversationDetail(loaded.conversation.id);
    },
  };

  async function getAgent(agentId: string): Promise<AgentRow> {
    const agent = await options.db.query.agents.findFirst({
      where: (table, operators) => operators.eq(table.id, agentId),
    });

    if (!agent || agent.status !== "active") {
      throw new NotFoundError("Agent not found.");
    }

    return agent;
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
        ),
    });

    if (!conversation) {
      throw new NotFoundError("Conversation not found.");
    }

    return conversation;
  }

  async function getConversationAgent(conversationId: string): Promise<{
    agent: AgentRow;
    conversation: ConversationRow;
  }> {
    const conversation = await options.db.query.conversations.findFirst({
      where: (table, operators) => operators.eq(table.id, conversationId),
    });

    if (!conversation || conversation.status !== "active") {
      throw new NotFoundError("Conversation not found.");
    }

    const agent = await getAgent(conversation.agent_id);
    return { agent, conversation };
  }

  async function createConversation(agent: AgentRow): Promise<ConversationRow> {
    const session = await options.opencodeService.createSession(agent.workspace_path, agent.name);
    const timestamp = new Date(session.time.updated ?? session.time.created);

    await options.db
      .update(conversations)
      .set({ is_current: false, updated_at: timestamp })
      .where(eq(conversations.agent_id, agent.id));

    const [created] = await options.db
      .insert(conversations)
      .values({
        id: createId(),
        agent_id: agent.id,
        opencode_session_id: session.id,
        title: cleanTitle(session.title),
        status: "active",
        is_current: true,
        created_at: new Date(session.time.created),
        updated_at: timestamp,
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

  async function syncConversation(agent: AgentRow, conversation: ConversationRow): Promise<void> {
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
        operators.and(operators.eq(table.agent_id, agentId), operators.eq(table.status, "active")),
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
      isCurrent: conversation.is_current,
      messageCount: rows.length,
      createdAt: conversation.created_at.toISOString(),
      updatedAt: conversation.updated_at.toISOString(),
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

function cleanTitle(value: string | null | undefined): string | undefined {
  const title = value?.trim();
  return title ? title : undefined;
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

function mapRemoteMessage(
  conversationId: string,
  message: OpenCodeSessionMessage,
): ConversationMessage & { createdAtMs: number; updatedAtMs: number } {
  const attachments = extractAttachments(message.parts);
  const parts = message.parts.map(sanitizePart);
  const createdAtMs = message.info.time.created;
  const updatedAtMs = message.info.time.completed ?? createdAtMs;

  return {
    ...conversationMessageSchema.parse({
      id: message.info.id,
      conversationId,
      role: message.info.role,
      content: readContent(message.parts),
      parts,
      attachments,
      createdAt: new Date(createdAtMs).toISOString(),
      updatedAt: new Date(updatedAtMs).toISOString(),
    }),
    createdAtMs,
    updatedAtMs,
  };
}

function readContent(parts: OpenCodeSessionMessage["parts"]): string {
  return parts
    .flatMap((part) => {
      const text =
        part.type === "text" && typeof part["text"] === "string" ? part["text"].trim() : "";
      return text ? [text] : [];
    })
    .join("\n\n");
}

function sanitizePart(part: OpenCodeSessionMessage["parts"][number]) {
  if (part.type === "file") {
    return {
      id: part.id,
      type: part.type,
      mime: typeof part["mime"] === "string" ? part["mime"] : "application/octet-stream",
      filename: typeof part["filename"] === "string" ? part["filename"] : undefined,
      source: isRecord(part["source"]) ? part["source"] : undefined,
    };
  }

  if (part.type === "tool" && isRecord(part["state"])) {
    return {
      ...part,
      state: sanitizeToolState(part["state"]),
    };
  }

  return part;
}

function sanitizeToolState(state: Record<string, unknown>) {
  if (!Array.isArray(state["attachments"])) {
    return state;
  }

  return {
    ...state,
    attachments: state["attachments"].flatMap((attachment) => {
      if (!isRecord(attachment) || typeof attachment["mime"] !== "string") {
        return [];
      }

      return [
        {
          id: typeof attachment["id"] === "string" ? attachment["id"] : undefined,
          type: "file",
          mime: attachment["mime"],
          filename: typeof attachment["filename"] === "string" ? attachment["filename"] : undefined,
          source: isRecord(attachment["source"]) ? attachment["source"] : undefined,
        },
      ];
    }),
  };
}

function extractAttachments(parts: OpenCodeSessionMessage["parts"]): ConversationAttachment[] {
  const map = new Map<string, ConversationAttachment>();

  for (const part of parts) {
    const attachments = readPartAttachments(part);

    for (const attachment of attachments) {
      const key = attachment.id ?? `${attachment.mimeType}:${attachment.filename ?? ""}`;
      map.set(key, attachment);
    }
  }

  return [...map.values()];
}

function readPartAttachments(
  part: OpenCodeSessionMessage["parts"][number],
): ConversationAttachment[] {
  if (part.type === "file") {
    return [
      conversationAttachmentSchema.parse({
        id: part.id,
        type: inferAttachmentType(part["mime"]),
        filename: typeof part["filename"] === "string" ? part["filename"] : undefined,
        mimeType: typeof part["mime"] === "string" ? part["mime"] : "application/octet-stream",
        source: isRecord(part["source"]) ? part["source"] : undefined,
      }),
    ];
  }

  if (
    part.type !== "tool" ||
    !isRecord(part["state"]) ||
    !Array.isArray(part["state"]["attachments"])
  ) {
    return [];
  }

  return part["state"]["attachments"].flatMap((attachment) => {
    if (!isRecord(attachment) || typeof attachment["mime"] !== "string") {
      return [];
    }

    return [
      conversationAttachmentSchema.parse({
        id: typeof attachment["id"] === "string" ? attachment["id"] : undefined,
        type: inferAttachmentType(attachment["mime"]),
        filename: typeof attachment["filename"] === "string" ? attachment["filename"] : undefined,
        mimeType: attachment["mime"],
        source: isRecord(attachment["source"]) ? attachment["source"] : undefined,
      }),
    ];
  });
}

function inferAttachmentType(mime: unknown): "file" | "image" | "document" {
  if (typeof mime !== "string") {
    return "file";
  }

  if (mime.startsWith("image/")) {
    return "image";
  }

  if (mime === "application/pdf" || mime.startsWith("text/")) {
    return "document";
  }

  return "file";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
