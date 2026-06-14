import { customToolBulkCopyResultSchema, type CustomToolBulkCopyResult } from "@cc/shared/schemas";

import { ConflictError, NotFoundError } from "../lib/api-error.js";
import { slugifyIdentifier } from "../lib/slug.js";
import type { SpecialistService } from "./specialist-service.js";
import type { CustomToolService } from "./custom-tool-service.js";

type CopyGlobalToolToAgentsInput = {
  slug: string;
  agentIds: string[];
  destinationName?: string;
  overwrite: boolean;
};

type CopyGlobalToolToAgentInput = {
  slug: string;
  agentSlug: string;
  destinationName?: string;
  overwrite: boolean;
};

export type CustomToolCopyConflict = {
  toolSlug: string;
  toolName: string;
  agentId: string;
  agentSlug: string;
  currentName: string;
  message: string;
};

export type CustomToolCopyActionResult =
  | {
      status: "copied";
      destinationSlug: string;
      result: CustomToolBulkCopyResult;
    }
  | {
      status: "conflict";
      conflict: CustomToolCopyConflict;
    };

export type CustomToolActionService = ReturnType<typeof createCustomToolActionService>;

export function createCustomToolActionService(options: {
  customToolService: CustomToolService;
  agentService: SpecialistService;
}) {
  return {
    async copyGlobalToolToAgent(
      input: CopyGlobalToolToAgentInput,
    ): Promise<CustomToolCopyActionResult> {
      const agent = await options.agentService.getBySlug(input.agentSlug);

      if (!agent) {
        throw new NotFoundError("Specialist not found.");
      }

      return copyGlobalToolToAgents({
        slug: input.slug,
        agentIds: [agent.id],
        destinationName: input.destinationName,
        overwrite: input.overwrite,
      });
    },

    copyGlobalToolToAgents,
  };

  async function copyGlobalToolToAgents(
    input: CopyGlobalToolToAgentsInput,
  ): Promise<CustomToolCopyActionResult> {
    const tool = await options.customToolService.getGlobal(input.slug);
    const destinationName = input.destinationName?.trim();
    const destinationSlug = destinationName ? slugifyIdentifier(destinationName) : tool.slug;

    try {
      if (destinationSlug !== tool.slug) {
        const result = await options.customToolService.copyGlobalToAgents({
          slug: input.slug,
          agentIds: input.agentIds,
          destinationName,
          overwrite: input.overwrite,
        });

        return { status: "copied", destinationSlug, result };
      }

      const copied: Array<{ agentId: string; agentSlug: string; overwritten: boolean }> = [];

      for (const agentId of input.agentIds) {
        const agent = await options.agentService.get(agentId);

        if (!agent) {
          throw new NotFoundError("Specialist not found.");
        }

        const nextCustomTools = agent.capabilities.customTools.includes(tool.slug)
          ? agent.capabilities.customTools
          : [...agent.capabilities.customTools, tool.slug];

        const updated = await options.agentService.update(agent.id, {
          capabilities: {
            ...agent.capabilities,
            customTools: nextCustomTools,
          },
          customToolOverwriteSlugs: input.overwrite ? [tool.slug] : [],
        });

        if (!updated) {
          throw new NotFoundError("Specialist not found.");
        }

        copied.push({
          agentId: updated.id,
          agentSlug: updated.slug,
          overwritten: input.overwrite,
        });
      }

      const result = customToolBulkCopyResultSchema.parse({ copied, warnings: tool.warnings });

      return { status: "copied", destinationSlug, result };
    } catch (error) {
      if (!(error instanceof ConflictError)) {
        throw error;
      }

      const agent = await resolveConflictAgent(input.agentIds);

      return {
        status: "conflict",
        conflict: {
          toolSlug: tool.slug,
          toolName: tool.name,
          agentId: agent.id,
          agentSlug: agent.slug,
          currentName: tool.name,
          message: error.message,
        },
      };
    }
  }

  async function resolveConflictAgent(agentIds: string[]): Promise<{ id: string; slug: string }> {
    const agent = await options.agentService.get(agentIds[0] ?? "");

    if (!agent) {
      throw new NotFoundError("Specialist not found.");
    }

    return { id: agent.id, slug: agent.slug };
  }
}
