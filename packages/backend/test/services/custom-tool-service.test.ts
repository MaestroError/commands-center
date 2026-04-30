import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createCustomToolService } from "../../src/services/custom-tool-service";
import { createTestDatabase } from "../helpers/db";
import type { OpenCodeService } from "../../src/services/opencode-service";

describe("createCustomToolService", () => {
  it("creates portable global tools and tracks matching, outdated, and modified agent copies", async () => {
    const testDb = await createTestDatabase();
    const service = createCustomToolService({
      config: testDb.config,
      db: testDb.client.db,
      opencodeService: createMockOpenCodeService(),
    });
    const agentWorkspacePath = join(testDb.config.paths.subdirectories.agents, "writer");

    try {
      await mkdir(agentWorkspacePath, { recursive: true });

      const created = await service.create({
        name: "Release Helper",
        description: "Draft release notes.",
      });

      await service.syncAgentAssignments({
        workspacePath: agentWorkspacePath,
        selectedToolSlugs: [created.tool.slug],
      });

      const matching = await service.listAgentTools({ workspacePath: agentWorkspacePath });
      expect(matching[0]?.status).toBe("matching");

      await writeFile(
        join(created.tool.directoryPath, created.tool.entryFile),
        (await readFile(join(created.tool.directoryPath, created.tool.entryFile), "utf8")).replace(
          "TODO: implement this tool.",
          "updated global implementation",
        ),
        "utf8",
      );

      const outdated = await service.listAgentTools({ workspacePath: agentWorkspacePath });
      expect(outdated[0]?.status).toBe("outdated");

      await writeFile(
        join(agentWorkspacePath, ".opencode", "tools", created.tool.slug, "tool.ts"),
        (
          await readFile(
            join(agentWorkspacePath, ".opencode", "tools", created.tool.slug, "tool.ts"),
            "utf8",
          )
        ).replace("TODO: implement this tool.", "locally modified agent implementation"),
        "utf8",
      );

      const modified = await service.listAgentTools({ workspacePath: agentWorkspacePath });
      expect(modified[0]?.status).toBe("modified");
    } finally {
      await testDb.cleanup();
    }
  });
});

function createMockOpenCodeService(): OpenCodeService {
  return {
    ensureStarted: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => ({ status: "ready", baseUrl: "http://127.0.0.1:4100" })),
    dispose: vi.fn(() => Promise.resolve()),
    disposeGlobal: vi.fn(() => Promise.resolve()),
    providerAuthStart: vi.fn(),
    providerAuthComplete: vi.fn(),
    providerAuthCancel: vi.fn(),
    providerListModels: vi.fn(() => Promise.resolve([])),
    providerListAuthMethods: vi.fn(() => Promise.resolve([])),
    providerListConnections: vi.fn(() => Promise.resolve([])),
    providerGetConfigProviders: vi.fn(() => Promise.resolve([])),
    providerConnectApiKey: vi.fn(),
    mcpRefresh: vi.fn(),
    mcpListServers: vi.fn(() => Promise.resolve([])),
    mcpAddServer: vi.fn(),
    mcpUpdateServer: vi.fn(),
    mcpDeleteServer: vi.fn(),
    mcpGetAuthStatus: vi.fn(),
    mcpStartOauth: vi.fn(),
    mcpAuthenticateServer: vi.fn(),
    mcpDeleteAuth: vi.fn(),
    mcpReadConfig: vi.fn(() => Promise.resolve(null)),
    mcpWriteConfig: vi.fn(() => Promise.resolve()),
    sessionList: vi.fn(),
    sessionResolveCurrent: vi.fn(),
    sessionCreate: vi.fn(),
    sessionPrompt: vi.fn(),
    sessionAbort: vi.fn(),
    sessionSummarize: vi.fn(),
    sessionHistory: vi.fn(),
    sessionGet: vi.fn(),
    findFiles: vi.fn(),
    findText: vi.fn(),
    readFile: vi.fn(),
    getFileStatus: vi.fn(),
    createPty: vi.fn(),
    listPtys: vi.fn(),
    getPty: vi.fn(),
    killPty: vi.fn(),
    resizePty: vi.fn(),
  } as unknown as OpenCodeService;
}
