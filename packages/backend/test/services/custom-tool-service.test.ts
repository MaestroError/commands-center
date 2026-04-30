import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createCustomToolService } from "../../src/services/custom-tool-service";
import { ConflictError } from "../../src/lib/api-error";
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

  it("copies tools with renamed destinations and removes agent-local tools", async () => {
    const testDb = await createTestDatabase();
    const agentWorkspacePath = join(testDb.config.paths.subdirectories.agents, "writer");
    const service = createCustomToolService({
      config: testDb.config,
      db: testDb.client.db,
      opencodeService: createMockOpenCodeService(),
      listAgents: () =>
        Promise.resolve([
          {
            id: "agent-1",
            slug: "writer",
            name: "Writer",
            workspacePath: agentWorkspacePath,
          },
        ]),
    });

    try {
      await mkdir(agentWorkspacePath, { recursive: true });

      const created = await service.create({
        name: "Release Helper",
        description: "Draft release notes.",
      });

      const copied = await service.copyGlobalToAgents({
        slug: created.tool.slug,
        agentIds: ["agent-1"],
        destinationName: "Release Helper Copy",
        overwrite: false,
      });
      expect(copied.copied[0]?.agentId).toBe("agent-1");

      const agentTools = await service.listAgentTools({ workspacePath: agentWorkspacePath });
      expect(agentTools.map((tool) => tool.slug)).toContain("release-helper-copy");

      await service.removeAgentTool({
        workspacePath: agentWorkspacePath,
        toolSlug: "release-helper-copy",
      });

      const remainingTools = await service.listAgentTools({ workspacePath: agentWorkspacePath });
      expect(remainingTools).toHaveLength(0);
    } finally {
      await testDb.cleanup();
    }
  });

  it("supports renamed global import and old metadata without localToolName", async () => {
    const testDb = await createTestDatabase();
    const service = createCustomToolService({
      config: testDb.config,
      db: testDb.client.db,
      opencodeService: createMockOpenCodeService(),
    });
    const agentWorkspacePath = join(testDb.config.paths.subdirectories.agents, "writer");

    try {
      await mkdir(join(agentWorkspacePath, ".opencode", "tools", "legacy-tool"), {
        recursive: true,
      });
      await writeFile(
        join(agentWorkspacePath, ".opencode", "tools", "legacy-tool.ts"),
        'export { default } from "./legacy-tool/tool";\n',
        "utf8",
      );
      await writeFile(
        join(agentWorkspacePath, ".opencode", "tools", "legacy-tool", "tool.ts"),
        'export default "legacy";\n',
        "utf8",
      );
      await writeFile(
        join(agentWorkspacePath, ".opencode", "tools", "legacy-tool.cc-tool-copy.json"),
        JSON.stringify({
          version: 1,
          managedBy: "cc",
          sourceToolSlug: "legacy-tool",
          sourceToolName: "Legacy Tool",
          sourceDescription: "Older metadata shape",
          sourceFingerprint: "old",
          entryFile: "legacy-tool.ts",
          copiedAt: new Date().toISOString(),
        }),
        "utf8",
      );

      const legacyTools = await service.listAgentTools({ workspacePath: agentWorkspacePath });
      expect(legacyTools[0]?.name).toBe("Legacy Tool");

      const created = await service.create({
        name: "Release Helper",
        description: "Draft release notes.",
      });
      await service.syncAgentAssignments({
        workspacePath: agentWorkspacePath,
        selectedToolSlugs: [created.tool.slug],
      });

      const copied = await service.copyAgentToolToGlobal({
        agent: { workspacePath: agentWorkspacePath },
        toolSlug: created.tool.slug,
        destinationName: "Release Helper Variant",
        overwrite: false,
      });
      expect(copied.tool.slug).toBe("release-helper-variant");
    } finally {
      await testDb.cleanup();
    }
  });

  it("requires overwrite when replacing a diverged agent copy", async () => {
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

      await writeFile(
        join(agentWorkspacePath, ".opencode", "tools", created.tool.slug, "tool.ts"),
        'export default "modified";\n',
        "utf8",
      );

      await expect(
        service.syncAgentAssignments({
          workspacePath: agentWorkspacePath,
          selectedToolSlugs: [created.tool.slug],
        }),
      ).rejects.toBeInstanceOf(ConflictError);

      await expect(
        service.syncAgentAssignments({
          workspacePath: agentWorkspacePath,
          selectedToolSlugs: [created.tool.slug],
          overwriteSlugs: [created.tool.slug],
        }),
      ).resolves.toBeUndefined();
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
