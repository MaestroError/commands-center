import { z } from "zod";

export const apiErrorCodeSchema = z.enum([
  "bad_request",
  "invalid_request",
  "not_found",
  "conflict",
  "forbidden",
  "internal_error",
]);

export const apiValidationDetailsSchema = z.object({
  formErrors: z.array(z.string()),
  fieldErrors: z.record(z.string(), z.array(z.string())),
});

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export const apiErrorResponseSchema = z.object({
  error: apiErrorSchema,
});

export const apiValidationErrorResponseSchema = z.object({
  error: apiErrorSchema.extend({
    code: z.literal("invalid_request"),
    details: apiValidationDetailsSchema,
  }),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type ApiValidationDetails = z.infer<typeof apiValidationDetailsSchema>;
export type ApiValidationErrorResponse = z.infer<typeof apiValidationErrorResponseSchema>;
