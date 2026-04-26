import { z } from "zod";

const looseRecordSchema = z.record(z.string(), z.unknown());

export const conversationMessageErrorSchema = z.object({
  name: z.string().min(1),
  message: z.string().min(1),
  data: looseRecordSchema.optional(),
});

export const conversationStatusSchema = z.enum(["active", "archived"]);

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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const conversationSummarySchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  opencodeSessionId: z.string().min(1),
  title: z.string().min(1).optional(),
  status: conversationStatusSchema,
  isCurrent: z.boolean(),
  messageCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const conversationDetailSchema = conversationSummarySchema.extend({
  messages: z.array(conversationMessageSchema),
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
export type ConversationPart = z.infer<typeof conversationPartSchema>;
export type ConversationSnapshot = z.infer<typeof conversationSnapshotSchema>;
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type SessionMediaItem = z.infer<typeof sessionMediaItemSchema>;
export type SendConversationAttachmentInput = z.infer<typeof sendConversationAttachmentInputSchema>;
export type SendConversationCommandInput = z.infer<typeof sendConversationCommandInputSchema>;
export type SendConversationPromptInput = z.infer<typeof sendConversationPromptInputSchema>;
export type SendConversationShellInput = z.infer<typeof sendConversationShellInputSchema>;
