import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { Logger } from "pino";

import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { APP_NAME } from "./constants.js";
import { getDefinition, systemPromptDefinitions } from "./definitions/index.js";
import { renderTemplate } from "./render.js";
import type {
  ComposedSystemPrompt,
  ResolvedSystemPrompt,
  SystemPromptDefinition,
  SystemPromptOverrides,
  SystemPromptRenderContext,
  SystemPromptScope,
} from "./types.js";

const MAX_BODY_BYTES = 65_536;

export type SystemPromptService = ReturnType<typeof createSystemPromptService>;

export function createSystemPromptService(options: { config: RuntimeConfig; logger?: Logger }) {
  const { config, logger } = options;

  function filePathFor(definition: SystemPromptDefinition): string {
    return resolve(
      config.paths.subdirectories.configuration,
      "system-prompts",
      `${definition.id}.md`,
    );
  }

  function requireDefinition(id: string): SystemPromptDefinition {
    const definition = getDefinition(id);
    if (!definition) {
      throw new NotFoundError(`Unknown system prompt: ${id}`);
    }
    return definition;
  }

  /** Read the workspace file; ENOENT → fall back to the shipped default. */
  async function readBody(
    definition: SystemPromptDefinition,
  ): Promise<{ body: string; isCustomized: boolean }> {
    try {
      const body = await readFile(filePathFor(definition), "utf8");
      return { body, isCustomized: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { body: definition.defaultBody, isCustomized: false };
      }
      throw error;
    }
  }

  function isEffectivelyEnabled(
    definition: SystemPromptDefinition,
    overrides?: SystemPromptOverrides,
  ): boolean {
    const override = overrides?.[definition.id];
    return override ?? definition.enabledByDefault;
  }

  function applies(definition: SystemPromptDefinition, scope: SystemPromptScope): boolean {
    return definition.scope === scope || definition.scope === "both";
  }

  return {
    listDefinitions(): SystemPromptDefinition[] {
      return systemPromptDefinitions;
    },

    async getBody(id: string): Promise<{ body: string; isCustomized: boolean }> {
      return readBody(requireDefinition(id));
    },

    getDefaultBody(id: string): string {
      return requireDefinition(id).defaultBody;
    },

    async isCustomized(id: string): Promise<boolean> {
      return (await readBody(requireDefinition(id))).isCustomized;
    },

    async saveBody(id: string, body: string): Promise<void> {
      const definition = requireDefinition(id);

      if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
        throw new BadRequestError("System prompt body must be 64 KB or smaller.");
      }
      if (!definition.optional && body.trim().length === 0) {
        throw new BadRequestError(`System prompt "${definition.title}" cannot be empty.`);
      }

      const targetPath = filePathFor(definition);
      await mkdir(dirname(targetPath), { recursive: true });
      const tmp = `${targetPath}.tmp`;
      await writeFile(tmp, body, "utf8");
      await rename(tmp, targetPath);
    },

    /** Delete the workspace file so resolution falls back to the shipped default. */
    async resetBody(id: string): Promise<void> {
      const definition = requireDefinition(id);
      await rm(filePathFor(definition), { force: true });
    },

    /** Compose the `system` string for a scope: the model-facing output. */
    async resolveAll(
      scope: SystemPromptScope,
      ctx: SystemPromptRenderContext,
      overrides?: SystemPromptOverrides,
    ): Promise<ComposedSystemPrompt> {
      const selected = systemPromptDefinitions
        .filter((definition) => applies(definition, scope))
        .filter((definition) => isEffectivelyEnabled(definition, overrides));

      const prompts: ComposedSystemPrompt["prompts"] = [];
      for (const definition of selected) {
        const { body } = await readBody(definition);
        const renderedBody = renderTemplate(body, ctx, definition.variables, logger);
        if (renderedBody.trim().length === 0) {
          continue;
        }
        prompts.push({
          id: definition.id,
          title: definition.title,
          renderedBody,
          enabled: true,
        });
      }

      prompts.sort((a, b) => (getDefinition(a.id)?.order ?? 0) - (getDefinition(b.id)?.order ?? 0));

      return {
        system: prompts.map((prompt) => prompt.renderedBody).join("\n\n"),
        prompts,
      };
    },

    /**
     * Like compose, but keeps disabled/empty entries flagged — for the chat
     * sidebar and Settings preview.
     */
    async listResolved(
      scope: SystemPromptScope,
      ctx: SystemPromptRenderContext,
      overrides?: SystemPromptOverrides,
    ): Promise<ResolvedSystemPrompt[]> {
      const selected = systemPromptDefinitions
        .filter((definition) => applies(definition, scope))
        .sort((a, b) => a.order - b.order);

      const resolved: ResolvedSystemPrompt[] = [];
      for (const definition of selected) {
        const { body, isCustomized } = await readBody(definition);
        resolved.push({
          id: definition.id,
          title: definition.title,
          description: definition.description,
          scope: definition.scope,
          danger: definition.danger,
          optional: definition.optional,
          enabled: isEffectivelyEnabled(definition, overrides),
          isCustomized,
          renderedBody: renderTemplate(body, ctx, definition.variables, logger),
        });
      }
      return resolved;
    },
  };
}

export { APP_NAME };
