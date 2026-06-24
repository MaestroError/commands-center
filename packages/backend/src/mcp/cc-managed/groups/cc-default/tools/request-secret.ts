import { z } from "zod";

import type { ActivityService } from "../../../../../services/activity-service.js";
import type { SecretService } from "../../../../../services/secret-service.js";

const requestSecretInputSchema = z.object({
  key: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
});

const requestSecretOutputSchema = z.object({
  key: z.string().min(1),
  requested: z.literal(true),
});

export const requestSecretToolMetadata = {
  name: "request_secret",
  description:
    "Ask the CommandsCenter operator to provide a workspace secret (such as an API key). Non-blocking: it registers the secret key as unset and posts an action item to the operator's activity thread. It does NOT pause your turn, and the value will not be available until the operator fills it (which restarts the AI engine). Use this in chat when a credential is missing; do not assume the secret is available in the same turn.",
  context: "chat",
} as const;

export function createRequestSecretDefinition(options: {
  secretService: SecretService;
  activityService: ActivityService;
}) {
  return {
    name: requestSecretToolMetadata.name,
    description: requestSecretToolMetadata.description,
    context: requestSecretToolMetadata.context,
    inputSchema: requestSecretInputSchema,
    outputSchema: requestSecretOutputSchema,
    async execute(args: unknown, _context: { agentSlug: string }) {
      const parsed = requestSecretInputSchema.parse(args);
      const key = parsed.key.trim();

      try {
        // Register the key as unset so it appears in Settings → Secrets as
        // "needs a value", and post the action item for the operator.
        await options.secretService.ensure([key]);
        await options.activityService.emit({
          kind: "secret_request",
          level: "action_required",
          title: `Secret needed: ${key}`,
          body: parsed.reason ?? null,
          payload: { secretKey: key },
          dedupeKey: `secret_request:${key}`,
        });

        const structuredContent = requestSecretOutputSchema.parse({ key, requested: true });
        return {
          structuredContent,
          content: [
            {
              type: "text" as const,
              text: `Requested secret '${key}' from the operator. It will not be available until they provide it (which restarts the AI engine), so do not assume it is set in this turn.`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to request secret.";
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  };
}
