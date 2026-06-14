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
    "Open a file from this specialist workspace in the CommandsCenter operator's preview tab while the specialist waits. Accepts either a specialist-relative path or an absolute path inside this specialist workspace.",
  context: "chat",
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
    context: showFileToUserToolMetadata.context,
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
          throw new Error(`Specialist '${context.agentSlug}' not found.`);
        }

        const path = normalizeSpecialistFilePath({
          path: parsed.path,
          specialistSlug: context.agentSlug,
          workspaceDir: options.config.paths.workspaceDir,
          specialistsDir: options.config.paths.subdirectories.specialists,
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

export function normalizeSpecialistFilePath(options: {
  path: string;
  specialistSlug: string;
  workspaceDir: string;
  specialistsDir: string;
}): string {
  const rawPath = options.path.trim();

  if (rawPath.length === 0 || rawPath === ".") {
    throw new Error("A file path is required.");
  }

  const specialistRoot = resolve(options.specialistsDir, options.specialistSlug);
  const normalizedPath = isAbsolute(rawPath)
    ? pathInsideRoot(specialistRoot, rawPath)
    : relativeSpecialistPathFromWorkspacePath(rawPath, options.specialistSlug);

  if (normalizedPath) {
    return normalizedPath;
  }

  if (isAbsolute(rawPath)) {
    throw new Error("Absolute paths must point inside this specialist workspace.");
  }

  const normalized = rawPath.replace(/^\/+/, "").replace(/\/+/gu, "/");

  if (normalized.length === 0 || normalized === ".") {
    throw new Error("A file path is required.");
  }

  return normalized;
}

function relativeSpecialistPathFromWorkspacePath(
  path: string,
  specialistSlug: string,
): string | undefined {
  const normalized = path.replace(/^\/+/, "").replace(/\/+/gu, "/");
  const prefix = `specialists/${specialistSlug}/`;

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
