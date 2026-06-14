import { describe, expect, it } from "vitest";

import { createSpecialistService } from "../../src/services/specialist-service";
import { createCustomToolActionService } from "../../src/services/custom-tool-action-service";
import { createCustomToolService } from "../../src/services/custom-tool-service";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("custom tool action service", () => {
  it("copies a global tool to an agent through the same action used by routes and MCP", async () => {
    const testDb = await createTestDatabase();
    const openCodeService = createMockOpenCodeService();
    const customToolService = createCustomToolService({
      config: testDb.config,
      db: testDb.client.db,
      opencodeService: openCodeService,
      listAgents: async () => {
        const agents = await agentService.list();
        return agents.map((agent) => ({
          id: agent.id,
          slug: agent.slug,
          name: agent.name,
          workspacePath: agent.workspacePath,
        }));
      },
    });
    const agentService = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: openCodeService,
      customToolService,
    });
    const actionService = createCustomToolActionService({ customToolService, agentService });

    try {
      const created = await customToolService.create({
        name: "Release Helper",
        description: "Draft release notes.",
      });
      const agent = await agentService.create({
        name: "Writer",
        role: "write docs",
        instructions: "Write release docs.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {},
      });

      const result = await actionService.copyGlobalToolToAgent({
        slug: created.tool.slug,
        agentSlug: agent.slug,
        overwrite: false,
      });

      expect(result.status).toBe("copied");
      if (result.status !== "copied") {
        throw new Error("Expected copied result.");
      }
      expect(result.destinationSlug).toBe("release-helper");
      expect(result.result.copied[0]?.agentSlug).toBe(agent.slug);
    } finally {
      await testDb.cleanup();
    }
  });
});

function createMockOpenCodeService(): OpenCodeService {
  return {
    dispose: () => Promise.resolve(),
  } as unknown as OpenCodeService;
}
