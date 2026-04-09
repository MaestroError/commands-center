import { apiErrorResponseSchema, apiValidationErrorResponseSchema } from "@cc/shared/schemas";

export const commonErrorResponses = {
  400: apiValidationErrorResponseSchema,
  404: apiErrorResponseSchema,
  409: apiErrorResponseSchema,
  500: apiErrorResponseSchema,
} as const;
