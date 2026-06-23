import { z } from "zod";

export const systemPromptScopeSchema = z.enum(["chat", "task", "both"]);

/**
 * Metadata-only view of a code-shipped prompt definition. Resolver functions in
 * the backend variable catalog are never serialized — only the declared
 * variable ids travel to the client.
 */
export const systemPromptDefinitionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  scope: systemPromptScopeSchema,
  order: z.number().int(),
  optional: z.boolean(),
  danger: z.boolean(),
  enabledByDefault: z.boolean(),
  variables: z.array(z.string().min(1)),
});

export const systemPromptVariableMetaSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
});

/**
 * A definition resolved against a render context: rendered body plus the
 * per-prompt flags the UI needs (enabled/customized) without exposing the
 * template internals.
 */
export const resolvedSystemPromptSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  scope: systemPromptScopeSchema,
  danger: z.boolean(),
  optional: z.boolean(),
  enabled: z.boolean(),
  isCustomized: z.boolean(),
  renderedBody: z.string(),
});

/** PUT body for saving a prompt template. */
export const systemPromptBodySchema = z.object({
  body: z.string().max(65_536, "System prompt body must be 64 KB or smaller."),
});

/** Item in the per-prompt customization summary returned by the list endpoint. */
export const systemPromptListItemSchema = systemPromptDefinitionSchema.extend({
  isCustomized: z.boolean(),
});

/** GET /api/system-prompts response: definitions + the variable catalog. */
export const systemPromptListResponseSchema = z.object({
  prompts: z.array(systemPromptListItemSchema),
  variables: z.array(systemPromptVariableMetaSchema),
});

/** GET/PUT/DELETE /api/system-prompts/:id response. */
export const systemPromptDetailSchema = z.object({
  definition: systemPromptDefinitionSchema,
  body: z.string(),
  defaultBody: z.string(),
  isCustomized: z.boolean(),
});

export type SystemPromptScope = z.infer<typeof systemPromptScopeSchema>;
export type SystemPromptDefinitionMeta = z.infer<typeof systemPromptDefinitionSchema>;
export type SystemPromptVariableMeta = z.infer<typeof systemPromptVariableMetaSchema>;
export type ResolvedSystemPrompt = z.infer<typeof resolvedSystemPromptSchema>;
export type SystemPromptBody = z.infer<typeof systemPromptBodySchema>;
export type SystemPromptListItem = z.infer<typeof systemPromptListItemSchema>;
export type SystemPromptListResponse = z.infer<typeof systemPromptListResponseSchema>;
export type SystemPromptDetail = z.infer<typeof systemPromptDetailSchema>;
