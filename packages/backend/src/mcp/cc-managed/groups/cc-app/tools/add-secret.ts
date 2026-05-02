import { z } from "zod";

import type { AppDb } from "../../../../../db/client.js";
import type { RuntimeConfig } from "../../../../../lib/runtime-config.js";
import type { OpenCodeOrchestrator } from "../../../../../orchestrator/opencode-orchestrator.js";
import type { LiveRequestService } from "../../../../../services/live-request-service.js";
import type { OpenCodeService } from "../../../../../services/opencode-service.js";
import type { SecretService } from "../../../../../services/secret-service.js";
import { createConversationService } from "../../../../../services/conversation-service.js";

const addSecretInputSchema = z.object({
  key: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  submitLabel: z.string().trim().min(1).optional(),
});

const addSecretOutputSchema = z.object({
  key: z.string().min(1),
  stored: z.literal(true),
});

export function createAddSecretDefinition(options: {
  db: AppDb;
  config: RuntimeConfig;
  opencodeService: OpenCodeService;
  liveRequestService: LiveRequestService;
  secretService: SecretService;
  orchestrator: OpenCodeOrchestrator;
}) {
  return {
    name: "add_secret",
    description:
      "Ask the CommandsCenter operator to securely enter a workspace secret while the agent waits.",
    inputSchema: addSecretInputSchema,
    outputSchema: addSecretOutputSchema,
    async execute(args: unknown, context: { agentSlug: string }) {
      const parsed = addSecretInputSchema.parse(args);
      const conversationService = createConversationService({
        db: options.db,
        config: options.config,
        opencodeService: options.opencodeService,
      });

      try {
        const agent = await options.db.query.agents.findFirst({
          where: (table, operators) => operators.eq(table.slug, context.agentSlug),
          columns: { id: true },
        });

        if (!agent) {
          throw new Error(`Agent '${context.agentSlug}' not found.`);
        }

        const snapshot = await conversationService.resolveCurrent(agent.id);
        const response = await options.liveRequestService.create({
          conversationId: snapshot.current.id,
          kind: "add_secret",
          closable: false,
          presentation: {
            title: parsed.title ?? "Add secret",
            description:
              parsed.description ??
              "The agent is waiting for you to add this secret. The value is stored encrypted and is never shown to the agent.",
            submitLabel: parsed.submitLabel ?? "Add secret",
            cancelLabel: "Cancel",
          },
          fields: [
            {
              type: "text" as const,
              name: "key",
              label: "Secret key",
              description: "Environment variable name exposed to agents, for example GITHUB_TOKEN.",
              placeholder: "SECRET_KEY",
              required: true,
              defaultValue: parsed.key,
            },
            {
              type: "password" as const,
              name: "value",
              label: "Secret value",
              required: true,
            },
          ],
        });

        const key = response.values["key"]?.trim();
        const value = response.values["value"];

        if (!key || !value) {
          throw new Error("Secret key and value are required.");
        }

        await options.secretService.set(key, value);
        void options.orchestrator.restart("secret updated");

        const structuredContent = addSecretOutputSchema.parse({ key, stored: true });

        return {
          structuredContent,
          content: [
            {
              type: "text" as const,
              text: `Secret '${key}' was stored successfully. The secret value was not exposed.`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to add secret.";

        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  };
}
