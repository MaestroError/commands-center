import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppDb } from "../../src/db/client";
import { agents } from "../../src/db/schema/index";
import { ConflictError, NotFoundError } from "../../src/lib/api-error";
import { createCustomToolService } from "../../src/services/custom-tool-service";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) {
    await disposers.pop()?.();
  }
});

function mockOpenCode(): OpenCodeService {
  return {
    dispose: vi.fn(() => Promise.resolve()),
    disposeGlobal: vi.fn(() => Promise.resolve()),
    listMcpToolIds: vi.fn(() => Promise.resolve([])),
  } as unknown as OpenCodeService;
}

async function insertAgent(db: AppDb, slug: string, workspacePath: string): Promise<string> {
  const id = `agent-${randomUUID()}`;
  const timestamp = new Date();
  await db.insert(agents).values({
    id,
    slug,
    name: "Tool Owner",
    role: "own tools",
    instructions: "Be useful.",
    default_model: "openai/gpt-4.1",
    icon_path: null,
    status: "active",
    capabilities_json: JSON.stringify({ workspacePath }),
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: null,
  });
  return id;
}

async function setup() {
  const testDb = await createTestDatabase();
  disposers.push(() => testDb.cleanup());
  const knownAgents: Array<{ id: string; slug: string; name: string; workspacePath: string }> = [];
  const service = createCustomToolService({
    config: testDb.config,
    db: testDb.client.db,
    opencodeService: mockOpenCode(),
    listAgents: () => Promise.resolve(knownAgents),
  });
  return { testDb, service, knownAgents };
}

describe("custom-tool-service errors", () => {
  it("raises NotFound for an unknown global tool", async () => {
    const { service } = await setup();
    await expect(service.getGlobal("missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creates a tool, rejects duplicates, and deletes it", async () => {
    const { service } = await setup();
    const created = await service.create({ name: "Formatter", description: "Format things." });
    expect(created.tool.slug).toBe("formatter");

    await expect(
      service.create({ name: "Formatter", description: "Again." }),
    ).rejects.toBeInstanceOf(ConflictError);

    // getGlobal now resolves the created tool.
    expect((await service.getGlobal("formatter")).slug).toBe("formatter");

    await service.deleteGlobal("formatter");
    await expect(service.getGlobal("formatter")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("raises NotFound when deleting an unknown tool", async () => {
    const { service } = await setup();
    await expect(service.deleteGlobal("missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("raises NotFound when copying an unknown global tool to agents", async () => {
    const { service } = await setup();
    await expect(
      service.copyGlobalToAgents({ slug: "missing", agentIds: ["agent-x"], overwrite: false }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("copies a global tool into an agent workspace", async () => {
    const { testDb, service, knownAgents } = await setup();
    const workspacePath = join(testDb.config.paths.subdirectories.specialists, "writer");
    await mkdir(workspacePath, { recursive: true });
    const agentId = await insertAgent(testDb.client.db, "writer", workspacePath);
    knownAgents.push({ id: agentId, slug: "writer", name: "Tool Owner", workspacePath });

    const created = await service.create({ name: "Copier", description: "Copy me." });
    const result = await service.copyGlobalToAgents({
      slug: created.tool.slug,
      agentIds: [agentId],
      overwrite: false,
    });
    expect(result.copied[0]?.agentId).toBe(agentId);

    const agentTools = await service.listAgentTools({ workspacePath });
    expect(agentTools.map((t) => t.slug)).toContain(created.tool.slug);
  });

  it("errors when importing a nonexistent agent-local tool to global", async () => {
    const { testDb, service } = await setup();
    const workspacePath = join(testDb.config.paths.subdirectories.specialists, "writer");
    await mkdir(workspacePath, { recursive: true });

    await expect(
      service.copyAgentToolToGlobal({
        agent: { workspacePath },
        toolSlug: "does-not-exist",
        overwrite: false,
      }),
    ).rejects.toThrow();
  });
});
