import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import {
  apiErrorResponseSchema,
  apiValidationDetailsSchema,
  apiValidationErrorResponseSchema,
  type ApiErrorCode,
  type ApiErrorResponse,
  type ApiValidationErrorResponse,
} from "@cc/shared/schemas";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(options: {
    code: ApiErrorCode;
    message: string;
    statusCode: number;
    details?: unknown;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string, details?: unknown) {
    super({ code: "not_found", message, statusCode: 404, details });
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, details?: unknown) {
    super({ code: "conflict", message, statusCode: 409, details });
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string, details?: unknown) {
    super({ code: "forbidden", message, statusCode: 403, details });
  }
}

export class CsrfError extends ApiError {
  constructor(message: string, details?: unknown) {
    super({ code: "csrf_invalid", message, statusCode: 403, details });
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string, details?: unknown) {
    super({ code: "unauthorized", message, statusCode: 401, details });
  }
}

export class RateLimitedError extends ApiError {
  constructor(message: string, details?: unknown) {
    super({ code: "rate_limited", message, statusCode: 429, details });
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string, details?: unknown) {
    super({ code: "bad_request", message, statusCode: 400, details });
  }
}

export function registerApiErrorHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
): void {
  if (isValidationError(error)) {
    const body = apiValidationErrorResponseSchema.parse({
      error: {
        code: "invalid_request",
        message: "Request validation failed.",
        details: readValidationDetails(error),
      },
    });

    request.log.warn({ err: error }, "request validation failed");
    void reply.status(400).send(body);
    return;
  }

  if (error instanceof ApiError) {
    const body = apiErrorResponseSchema.parse({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });

    if (error.statusCode >= 500) {
      request.log.error({ err: error }, "request failed");
    } else {
      request.log.warn({ err: error }, "request failed");
    }

    void reply.status(error.statusCode).send(body);
    return;
  }

  request.log.error({ err: error }, "unhandled request error");
  const body = apiErrorResponseSchema.parse({
    error: {
      code: "internal_error",
      message: "Internal server error.",
    },
  });
  void reply.status(500).send(body);
}

function isValidationError(error: unknown): error is {
  message: string;
  cause?: unknown;
  validation?: Array<{ instancePath?: string; keyword: string; message?: string }>;
} {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (
    Array.isArray((error as { validation?: unknown }).validation) ||
    (error as { cause?: unknown }).cause instanceof ZodError
  );
}

function readValidationDetails(error: {
  message: string;
  cause?: unknown;
  validation?: Array<{ instancePath?: string; keyword: string; message?: string }>;
}): ApiValidationErrorResponse["error"]["details"] {
  if (error.cause instanceof ZodError) {
    return apiValidationDetailsSchema.parse(error.cause.flatten());
  }

  const fieldErrors = Object.groupBy(
    error.validation ?? [],
    (issue) => issue.instancePath || issue.keyword,
  );

  return apiValidationDetailsSchema.parse({
    formErrors: [error.message],
    fieldErrors: Object.fromEntries(
      Object.entries(fieldErrors).map(([key, value]) => [
        key,
        (value ?? []).map((issue) => issue.message || "Invalid value."),
      ]),
    ),
  });
}

export const API_ERROR_RESPONSE = apiErrorResponseSchema satisfies {
  parse(input: unknown): ApiErrorResponse;
};
