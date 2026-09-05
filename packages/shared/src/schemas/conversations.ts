import { z } from "zod";

import { resolvedSystemPromptSchema } from "./system-prompts.js";

const looseRecordSchema = z.record(z.string(), z.unknown());

/** Per-conversation system prompt enabled overrides: prompt id → enabled. */
export const systemPromptOverridesSchema = z.record(z.string().min(1), z.boolean());

/**
 * Per-message token counts as the model provider reported them. Present on
 * assistant messages synced after CC started persisting them; older messages
 * fall back to the `step-finish` parts still carried in `parts`.
 */
export const conversationMessageTokensSchema = z.object({
  input: z.number().nonnegative().default(0),
  output: z.number().nonnegative().default(0),
  reasoning: z.number().nonnegative().default(0),
  cacheRead: z.number().nonnegative().default(0),
  cacheWrite: z.number().nonnegative().default(0),
  total: z.number().nonnegative().default(0),
});

export const conversationMessageErrorSchema = z.object({
  name: z.string().min(1),
  message: z.string().min(1),
  data: looseRecordSchema.optional(),
});

export const conversationStatusSchema = z.enum(["active", "archived"]);

export const conversationSourceSchema = z.enum(["chat", "task_run"]);

export const conversationAttachmentSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.enum(["file", "image", "document"]).default("file"),
  filename: z.string().min(1).optional(),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
  source: looseRecordSchema.optional(),
});

export const conversationPartSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
  })
  .catchall(z.unknown());

export const conversationMessageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  parts: z.array(conversationPartSchema),
  attachments: z.array(conversationAttachmentSchema),
  parentId: z.string().min(1).optional(),
  error: conversationMessageErrorSchema.optional(),
  tokens: conversationMessageTokensSchema.optional(),
  /**
   * Provider-reported cost in USD. Absent when the provider bills nothing per
   * request (subscription and OAuth models report a literal 0).
   */
  cost: z.number().nonnegative().optional(),
  modelId: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
  // The system prompts composed and sent with this message, captured at send
  // time. Present on user messages once captured; absent on older messages.
  systemPromptSnapshot: z.array(resolvedSystemPromptSchema).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const conversationSummarySchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  opencodeSessionId: z.string().min(1),
  title: z.string().min(1).optional(),
  status: conversationStatusSchema,
  source: conversationSourceSchema,
  isCurrent: z.boolean(),
  taskId: z.string().min(1).optional(),
  taskRunId: z.string().min(1).optional(),
  messageCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  convertedAt: z.string().datetime().optional(),
});

/** Newest-first page size for the initial conversation load. */
export const CONVERSATION_MESSAGE_PAGE_SIZE = 50;
/** Upper bound a client may request when paging older messages. */
export const CONVERSATION_MESSAGE_PAGE_MAX = 200;

export const conversationDetailSchema = conversationSummarySchema.extend({
  /**
   * The newest page of messages, oldest-first. `messageCount` on the summary is
   * the conversation's true total, so `hasMoreMessages` tells the client whether
   * older ones remain to be fetched.
   */
  messages: z.array(conversationMessageSchema),
  hasMoreMessages: z.boolean().optional(),
});

/** One older page, oldest-first, returned by the message paging endpoint. */
export const conversationMessagePageSchema = z.object({
  messages: z.array(conversationMessageSchema),
  hasMore: z.boolean().default(false),
});

/** Full, untrimmed parts for one message. */
export const conversationMessagePartsSchema = z.object({
  messageId: z.string().min(1),
  parts: z.array(conversationPartSchema),
});

export const conversationListSchema = z.array(conversationSummarySchema);

export const sessionMediaItemSchema = z.object({
  id: z.string().min(1),
  messageId: z.string().min(1),
  filename: z.string().min(1).optional(),
  mime: z.string().min(1),
  url: z.string().startsWith("data:"),
  createdAt: z.string().datetime(),
});

export const sessionMediaListSchema = z.array(sessionMediaItemSchema);

export const conversationSnapshotSchema = z.object({
  current: conversationDetailSchema,
  previous: conversationListSchema,
});

export const sendConversationAttachmentInputSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.enum(["file", "image", "document"]).default("file"),
  filename: z.string().min(1).optional(),
  mimeType: z.string().min(1),
  dataUrl: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
});

export const sendConversationPromptInputSchema = z.object({
  text: z.string(),
  attachments: z.array(sendConversationAttachmentInputSchema).default([]),
  /** Optional qualified `provider/model` override for this prompt. Falls back to the agent default. */
  model: z.string().trim().min(1).optional(),
});

export const sendConversationShellInputSchema = z.object({
  command: z.string().trim().min(1),
});

export const sendConversationCommandInputSchema = z.object({
  command: z.string().trim().min(1),
  arguments: z.string().default(""),
  attachments: z.array(sendConversationAttachmentInputSchema).default([]),
});

export type ConversationAttachment = z.infer<typeof conversationAttachmentSchema>;
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;
export type ConversationMessageError = z.infer<typeof conversationMessageErrorSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type ConversationMessagePage = z.infer<typeof conversationMessagePageSchema>;
export type ConversationMessageParts = z.infer<typeof conversationMessagePartsSchema>;
export type ConversationMessageTokens = z.infer<typeof conversationMessageTokensSchema>;
export type ConversationPart = z.infer<typeof conversationPartSchema>;
export type ConversationSnapshot = z.infer<typeof conversationSnapshotSchema>;
export type ConversationSource = z.infer<typeof conversationSourceSchema>;
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type SessionMediaItem = z.infer<typeof sessionMediaItemSchema>;
export type SendConversationAttachmentInput = z.infer<typeof sendConversationAttachmentInputSchema>;
export type SendConversationCommandInput = z.infer<typeof sendConversationCommandInputSchema>;
export type SendConversationPromptInput = z.infer<typeof sendConversationPromptInputSchema>;
export type SendConversationShellInput = z.infer<typeof sendConversationShellInputSchema>;
export type SystemPromptOverrides = z.infer<typeof systemPromptOverridesSchema>;
