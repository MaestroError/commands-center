import { isAbsolute, relative, resolve, sep } from "node:path";

import { z } from "zod";

import type { AppDb } from "../../../../../db/client.js";
import type { RuntimeConfig } from "../../../../../lib/runtime-config.js";
import type { LiveRequestService } from "../../../../../services/live-request-service.js";
import type { OpenCodeService } from "../../../../../services/opencode-service.js";
import { createConversationService } from "../../../../../services/conversation-service.js";

const showFileToUserInputSchema = z.object({
  path: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
});

const showFileToUserOutputSchema = z.object({
  path: z.string().min(1),
  shown: z.literal(true),
});

const showFileToUserDecisionSchema = z.object({
  action: z.literal("opened"),
  values: z.object({}),
});

export const showFileToUserToolMetadata = {
  name: "show_file_to_user",
  description:
    "Open a file from this agent workspace in the CommandsCenter operator's preview tab while the agent waits. Accepts either an agent-relative path or an absolute path inside this agent workspace.",
} as const;

export function createShowFileToUserDefinition(options: {
  db: AppDb;
  config: RuntimeConfig;
  opencodeService: OpenCodeService;
  liveRequestService: LiveRequestService;
}) {
  return {
    name: showFileToUserToolMetadata.name,
    description: showFileToUserToolMetadata.description,
    inputSchema: showFileToUserInputSchema,
    outputSchema: showFileToUserOutputSchema,
    async execute(args: unknown, context: { agentSlug: string }) {
      const parsed = showFileToUserInputSchema.parse(args);
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

        const path = normalizeAgentFilePath({
          path: parsed.path,
          agentSlug: context.agentSlug,
          workspaceDir: options.config.paths.workspaceDir,
          agentsDir: options.config.paths.subdirectories.agents,
        });
        const snapshot = await conversationService.resolveCurrent(agent.id);
        const response = await options.liveRequestService.create({
          conversationId: snapshot.current.id,
          kind: showFileToUserToolMetadata.name,
          closable: true,
          presentation: {
            title: parsed.title ?? `Opening ${path}`,
            description: "CommandsCenter is opening this file in the preview pane.",
            cancelLabel: "Dismiss",
          },
          fields: [],
          metadata: { path },
          timeoutMs: 30_000,
        });

        showFileToUserDecisionSchema.parse(response);
        const structuredContent = showFileToUserOutputSchema.parse({ path, shown: true });

        return {
          structuredContent,
          content: [
            {
              type: "text" as const,
              text: `Opened '${path}' in the CommandsCenter preview pane.`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to show file to user.";

        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  };
}

export function normalizeAgentFilePath(options: {
  path: string;
  agentSlug: string;
  workspaceDir: string;
  agentsDir: string;
}): string {
  const rawPath = options.path.trim();

  if (rawPath.length === 0 || rawPath === ".") {
    throw new Error("A file path is required.");
  }

  const agentRoot = resolve(options.agentsDir, options.agentSlug);
  const normalizedPath = isAbsolute(rawPath)
    ? pathInsideRoot(agentRoot, rawPath)
    : relativeAgentPathFromWorkspacePath(rawPath, options.agentSlug);

  if (normalizedPath) {
    return normalizedPath;
  }

  if (isAbsolute(rawPath)) {
    throw new Error("Absolute paths must point inside this agent workspace.");
  }

  const normalized = rawPath.replace(/^\/+/, "").replace(/\/+/gu, "/");

  if (normalized.length === 0 || normalized === ".") {
    throw new Error("A file path is required.");
  }

  return normalized;
}

function relativeAgentPathFromWorkspacePath(path: string, agentSlug: string): string | undefined {
  const normalized = path.replace(/^\/+/, "").replace(/\/+/gu, "/");
  const prefix = `agents/${agentSlug}/`;

  if (!normalized.startsWith(prefix)) {
    return undefined;
  }

  const relativePath = normalized.slice(prefix.length);
  return relativePath.length > 0 && relativePath !== "." ? relativePath : undefined;
}

function pathInsideRoot(root: string, path: string): string | undefined {
  const relativePath = relative(resolve(root), resolve(path));

  if (
    relativePath.length === 0 ||
    relativePath.startsWith("..") ||
    relativePath.includes(`${sep}..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return undefined;
  }

  return relativePath.replace(/\\/gu, "/");
}
