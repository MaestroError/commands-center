import { z } from "zod";

const liveRequestFormFieldBaseSchema = z.object({
  name: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().optional(),
  placeholder: z.string().trim().optional(),
  required: z.boolean().default(false),
});

export const liveRequestFormFieldSchema = z.discriminatedUnion("type", [
  liveRequestFormFieldBaseSchema.extend({
    type: z.literal("text"),
    defaultValue: z.string().optional(),
  }),
  liveRequestFormFieldBaseSchema.extend({
    type: z.literal("password"),
  }),
  liveRequestFormFieldBaseSchema.extend({
    type: z.literal("textarea"),
    defaultValue: z.string().optional(),
  }),
]);

export const liveRequestPresentationSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  submitLabel: z.string().trim().min(1),
  cancelLabel: z.string().trim().min(1).default("Cancel"),
});

export const liveRequestSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  kind: z.string().trim().min(1),
  presentation: liveRequestPresentationSchema,
  fields: z.array(liveRequestFormFieldSchema),
  closable: z.boolean().default(false),
  createdAt: z.string(),
});

export const liveRequestResolveInputSchema = z.object({
  values: z.record(z.string().trim().min(1), z.string()),
});

export const liveRequestCancelInputSchema = z.object({
  reason: z.string().trim().optional(),
});

export const liveRequestResolveResultSchema = z.object({
  ok: z.literal(true),
});

export type LiveRequestFormField = z.infer<typeof liveRequestFormFieldSchema>;
export type LiveRequestPresentation = z.infer<typeof liveRequestPresentationSchema>;
export type LiveRequest = z.infer<typeof liveRequestSchema>;
export type LiveRequestResolveInput = z.infer<typeof liveRequestResolveInputSchema>;
export type LiveRequestCancelInput = z.infer<typeof liveRequestCancelInputSchema>;
export type LiveRequestResolveResult = z.infer<typeof liveRequestResolveResultSchema>;
