import { z } from "zod";

import { conversationAttachmentSchema, conversationPartSchema } from "./conversations.js";
import { liveRequestSchema } from "./live-requests.js";

// --- SSE Event Schemas ---

const looseRecordSchema = z.record(z.string(), z.unknown());

const sessionStatusSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("idle"),
  }),
  z.object({
    type: z.literal("busy"),
  }),
  z.object({
    type: z.literal("retry"),
    attempt: z.number().int(),
    message: z.string(),
    next: z.number(),
  }),
]);

// Relaxed message schema for SSE events — conversationId may be empty since
// OpenCode events don't carry our internal conversation identifier.
const sseMessageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().default(""),
  role: z.enum(["user", "assistant"]),
  content: z.string().default(""),
  parts: z.array(conversationPartSchema).default([]),
  attachments: z.array(conversationAttachmentSchema).default([]),
  parentId: z.string().min(1).optional(),
  error: z
    .object({
      name: z.string().min(1),
      message: z.string().min(1),
      data: looseRecordSchema.optional(),
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const connectedEventSchema = z.object({
  type: z.literal("connected"),
  properties: z.object({}),
});

const heartbeatEventSchema = z.object({
  type: z.literal("heartbeat"),
  properties: z.object({}),
});

const sessionStatusEventSchema = z.object({
  type: z.literal("session.status"),
  properties: z.object({
    sessionID: z.string().min(1),
    status: sessionStatusSchema,
  }),
});

const sessionErrorEventSchema = z.object({
  type: z.literal("session.error"),
  properties: z.object({
    sessionID: z.string().min(1),
    error: z.object({
      name: z.string().min(1),
      message: z.string().min(1),
      data: looseRecordSchema.optional(),
    }),
  }),
});

const messageUpdatedEventSchema = z.object({
  type: z.literal("message.updated"),
  properties: z.object({
    sessionID: z.string().min(1),
    message: sseMessageSchema,
  }),
});

const messageRemovedEventSchema = z.object({
  type: z.literal("message.removed"),
  properties: z.object({
    sessionID: z.string().min(1),
    messageID: z.string().min(1),
  }),
});

const messagePartUpdatedEventSchema = z.object({
  type: z.literal("message.part.updated"),
  properties: z.object({
    sessionID: z.string().min(1),
    messageID: z.string().min(1),
    part: conversationPartSchema,
  }),
});

const messagePartDeltaEventSchema = z.object({
  type: z.literal("message.part.delta"),
  properties: z.object({
    sessionID: z.string().min(1),
    messageID: z.string().min(1),
    partID: z.string().min(1),
    field: z.string().min(1),
    delta: z.string(),
  }),
});

const messagePartRemovedEventSchema = z.object({
  type: z.literal("message.part.removed"),
  properties: z.object({
    sessionID: z.string().min(1),
    messageID: z.string().min(1),
    partID: z.string().min(1),
  }),
});

const todoItemSchema = z.object({
  content: z.string(),
  status: z.string(),
  activeForm: z.string().optional(),
});

const todoUpdatedEventSchema = z.object({
  type: z.literal("todo.updated"),
  properties: z.object({
    sessionID: z.string().min(1),
    todos: z.array(todoItemSchema),
  }),
});

const questionOptionSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
});

const questionItemSchema = z.object({
  question: z.string(),
  header: z.string().optional(),
  options: z.array(questionOptionSchema),
  multiSelect: z.boolean().optional(),
});

const permissionAskedEventSchema = z.object({
  type: z.literal("permission.asked"),
  properties: z.object({
    id: z.string().min(1),
    sessionID: z.string().min(1),
    permission: z.string(),
    patterns: z.array(z.string()).default([]),
    metadata: looseRecordSchema.default({}),
    always: z.array(z.string()).default([]),
  }),
});

const permissionRepliedEventSchema = z.object({
  type: z.literal("permission.replied"),
  properties: z.object({
    sessionID: z.string().min(1),
    requestID: z.string().min(1),
    reply: z.enum(["once", "always", "reject"]),
  }),
});

const questionAskedEventSchema = z.object({
  type: z.literal("question.asked"),
  properties: z.object({
    id: z.string().min(1),
    sessionID: z.string().min(1),
    questions: z.array(questionItemSchema),
  }),
});

const questionRepliedEventSchema = z.object({
  type: z.literal("question.replied"),
  properties: z.object({
    sessionID: z.string().min(1),
    requestID: z.string().min(1),
  }),
});

const questionRejectedEventSchema = z.object({
  type: z.literal("question.rejected"),
  properties: z.object({
    sessionID: z.string().min(1),
    requestID: z.string().min(1),
  }),
});

const liveRequestOpenedEventSchema = z.object({
  type: z.literal("cc.live_request.opened"),
  properties: z.object({
    request: liveRequestSchema,
  }),
});

const liveRequestResolvedEventSchema = z.object({
  type: z.literal("cc.live_request.resolved"),
  properties: z.object({
    requestId: z.string().min(1),
  }),
});

const liveRequestCancelledEventSchema = z.object({
  type: z.literal("cc.live_request.cancelled"),
  properties: z.object({
    requestId: z.string().min(1),
    reason: z.string().optional(),
  }),
});

export const chatEventSchema = z.discriminatedUnion("type", [
  connectedEventSchema,
  heartbeatEventSchema,
  sessionStatusEventSchema,
  sessionErrorEventSchema,
  messageUpdatedEventSchema,
  messageRemovedEventSchema,
  messagePartUpdatedEventSchema,
  messagePartDeltaEventSchema,
  messagePartRemovedEventSchema,
  todoUpdatedEventSchema,
  permissionAskedEventSchema,
  permissionRepliedEventSchema,
  questionAskedEventSchema,
  questionRepliedEventSchema,
  questionRejectedEventSchema,
  liveRequestOpenedEventSchema,
  liveRequestResolvedEventSchema,
  liveRequestCancelledEventSchema,
]);

export type ChatEvent = z.infer<typeof chatEventSchema>;
export type TodoItem = z.infer<typeof todoItemSchema>;
export type QuestionItem = z.infer<typeof questionItemSchema>;
export type QuestionOption = z.infer<typeof questionOptionSchema>;

// Narrowed event types for convenience
export type SessionStatusEvent = z.infer<typeof sessionStatusEventSchema>;
export type SessionErrorEvent = z.infer<typeof sessionErrorEventSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type MessageUpdatedEvent = z.infer<typeof messageUpdatedEventSchema>;
export type MessagePartDeltaEvent = z.infer<typeof messagePartDeltaEventSchema>;
export type MessagePartUpdatedEvent = z.infer<typeof messagePartUpdatedEventSchema>;
export type PermissionAskedEvent = z.infer<typeof permissionAskedEventSchema>;
export type QuestionAskedEvent = z.infer<typeof questionAskedEventSchema>;
export type TodoUpdatedEvent = z.infer<typeof todoUpdatedEventSchema>;
export type LiveRequestOpenedEvent = z.infer<typeof liveRequestOpenedEventSchema>;
export type LiveRequestResolvedEvent = z.infer<typeof liveRequestResolvedEventSchema>;
export type LiveRequestCancelledEvent = z.infer<typeof liveRequestCancelledEventSchema>;

// --- Interactive Reply Input Schemas ---

export const replyPermissionInputSchema = z.object({
  reply: z.enum(["once", "always", "reject"]),
});

export const replyQuestionInputSchema = z.object({
  answers: z.array(z.array(z.string())),
});

export type ReplyPermissionInput = z.infer<typeof replyPermissionInputSchema>;
export type ReplyQuestionInput = z.infer<typeof replyQuestionInputSchema>;
