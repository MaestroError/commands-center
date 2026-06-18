import { z } from "zod";

import { conversationMessageSchema, conversationSourceSchema } from "./conversations.js";

export const sessionArchiveKindSchema = z.enum(["chat", "task_run"]);

export const sessionArchiveStatusSchema = z.enum(["active", "completed", "archived"]);

export const sessionArchiveSpecialistSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
});

export const sessionArchiveMetadataSchema = z.object({
  version: z.literal(1),
  kind: sessionArchiveKindSchema,
  specialist: sessionArchiveSpecialistSchema,
  conversationId: z.string().min(1),
  opencodeSessionId: z.string().min(1).nullable().default(null),
  source: conversationSourceSchema,
  taskId: z.string().min(1).nullable().default(null),
  taskRunId: z.string().min(1).nullable().default(null),
  title: z.string().nullable().default(null),
  status: sessionArchiveStatusSchema,
  outcome: z.string().min(1).nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  messageCount: z.number().int().nonnegative().default(0),
  lastAppendedAt: z.string().datetime().nullable().default(null),
  lastMaterializedAt: z.string().datetime().nullable().default(null),
  lastMaterializedMessageCount: z.number().int().nonnegative().default(0),
  files: z
    .object({
      messages: z.string().min(1),
      transcript: z.string().min(1),
    })
    .default({ messages: "messages.jsonl", transcript: "transcript.md" }),
});

export const sessionArchiveMessageSchema = conversationMessageSchema;

export const sessionArchiveMaterializeResultSchema = z.object({
  materialized: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export const sessionArchiveSettingsSchema = z.object({
  sessionArchiveEnabled: z.boolean().default(true),
  sessionArchiveAppendMode: z.enum(["off", "debounced"]).default("debounced"),
  sessionArchiveMaterializeIntervalMinutes: z.number().int().positive().default(1440),
});

export type SessionArchiveKind = z.infer<typeof sessionArchiveKindSchema>;
export type SessionArchiveStatus = z.infer<typeof sessionArchiveStatusSchema>;
export type SessionArchiveSpecialist = z.infer<typeof sessionArchiveSpecialistSchema>;
export type SessionArchiveMetadata = z.infer<typeof sessionArchiveMetadataSchema>;
export type SessionArchiveMessage = z.infer<typeof sessionArchiveMessageSchema>;
export type SessionArchiveMaterializeResult = z.infer<typeof sessionArchiveMaterializeResultSchema>;
export type SessionArchiveSettings = z.infer<typeof sessionArchiveSettingsSchema>;
