import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppDb } from "../../../src/db/client";
import { agents } from "../../../src/db/schema/index";
import { CC_DEFAULT_INTERACTIVE_TOOL_CALL_TIMEOUT_MS } from "../../../src/mcp/cc-managed/live-request-timeouts";
import { syncCcManagedMcpSpecialistWorkspaces } from "../../../src/mcp/cc-managed/workspace-sync-service";
import { resolveSpecialistWorkspacePath } from "../../../src/services/specialist-workspace";
import { createTestDatabase } from "../../helpers/db";

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;
const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) {
    await disposers.pop()?.();
  }
});

async function insertAgent(db: AppDb, slug: string): Promise<void> {
  const timestamp = new Date();
  await db.insert(agents).values({
    id: `agent-${randomUUID()}`,
    slug,
    name: "Sync Specialist",
    role: "sync",
    instructions: "Be useful.",
    default_model: "openai/gpt-4.1",
    icon_path: null,
    status: "active",
    capabilities_json: JSON.stringify({
      builtInSkills: [],
      workspaceSkills: [],
      customTools: [],
      mcpServers: [],
      toolPermissions: [],
      appMcpServers: [],
      appToolPermissions: [],
    }),
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: null,
  });
}

describe("syncCcManagedMcpSpecialistWorkspaces", () => {
  it("writes workspace config, skips when up to date, and rewrites when config drifts", async () => {
    const testDb = await createTestDatabase();
    disposers.push(() => testDb.cleanup());
    await insertAgent(testDb.client.db, "sync-one");

    const first = await syncCcManagedMcpSpecialistWorkspaces({
      db: testDb.client.db,
      config: testDb.config,
      logger,
    });
    expect(first).toBe(1);
    const workspacePath = resolveSpecialistWorkspacePath({
      config: testDb.config,
      slug: "sync-one",
      status: "active",
    });
    expect(
      JSON.parse(await readFile(join(workspacePath, "opencode.jsonc"), "utf8")),
    ).toHaveProperty("permission");

    // Corrupt the config so the next sync detects drift and rewrites it.
    await mkdir(workspacePath, { recursive: true });
    await writeFile(join(workspacePath, "opencode.jsonc"), "{}", "utf8");

    const rewrite = await syncCcManagedMcpSpecialistWorkspaces({
      db: testDb.client.db,
      config: testDb.config,
      logger,
    });
    expect(rewrite).toBe(1);
    const rewritten = JSON.parse(await readFile(join(workspacePath, "opencode.jsonc"), "utf8"));
    expect(rewritten).toHaveProperty("permission");
  });

  it("rewrites a workspace whose MCP tool-call timeout is stale", async () => {
    const testDb = await createTestDatabase();
    disposers.push(() => testDb.cleanup());
    await insertAgent(testDb.client.db, "sync-timeout");

    await syncCcManagedMcpSpecialistWorkspaces({
      db: testDb.client.db,
      config: testDb.config,
      logger,
    });
    const workspacePath = resolveSpecialistWorkspacePath({
      config: testDb.config,
      slug: "sync-timeout",
      status: "active",
    });
    const configPath = join(workspacePath, "opencode.jsonc");
    const written = JSON.parse(await readFile(configPath, "utf8")) as {
      mcp: Record<string, { timeout?: number }>;
    };
    const interactiveTimeout = written.mcp["cc_default_interactive"]?.timeout;

    expect(interactiveTimeout).toBe(CC_DEFAULT_INTERACTIVE_TOOL_CALL_TIMEOUT_MS);

    // Drop the timeout, leaving url/enabled/auth intact. Without it opencode falls
    // back to the MCP SDK's 60s default and cuts the operator-blocking tools off
    // mid-review, so the sync must notice and rewrite.
    delete written.mcp["cc_default_interactive"]?.timeout;
    await writeFile(configPath, JSON.stringify(written, null, 2), "utf8");

    const rewrite = await syncCcManagedMcpSpecialistWorkspaces({
      db: testDb.client.db,
      config: testDb.config,
      logger,
    });

    expect(rewrite).toBe(1);
    const rewritten = JSON.parse(await readFile(configPath, "utf8")) as {
      mcp: Record<string, { timeout?: number }>;
    };
    expect(rewritten.mcp["cc_default_interactive"]?.timeout).toBe(
      CC_DEFAULT_INTERACTIVE_TOOL_CALL_TIMEOUT_MS,
    );
  });

  it("preserves specialist-local skills when startup synchronization rewrites config", async () => {
    const testDb = await createTestDatabase();
    disposers.push(() => testDb.cleanup());
    await insertAgent(testDb.client.db, "sync-local-skill");

    await syncCcManagedMcpSpecialistWorkspaces({
      db: testDb.client.db,
      config: testDb.config,
      logger,
    });
    const workspacePath = resolveSpecialistWorkspacePath({
      config: testDb.config,
      slug: "sync-local-skill",
      status: "active",
    });
    const localSkillPath = join(workspacePath, ".opencode", "skills", "designer-local");
    const localSkillContents =
      "---\nname: designer-local\ndescription: Private designer workflow\n---\n\n# Designer\n";

    await mkdir(localSkillPath, { recursive: true });
    await writeFile(join(localSkillPath, "SKILL.md"), localSkillContents, "utf8");
    await writeFile(join(workspacePath, "opencode.jsonc"), "{}", "utf8");

    await syncCcManagedMcpSpecialistWorkspaces({
      db: testDb.client.db,
      config: testDb.config,
      logger,
    });

    await expect(readFile(join(localSkillPath, "SKILL.md"), "utf8")).resolves.toBe(
      localSkillContents,
    );
  });

  it("adopts skill ownership when config is current but the manifest is missing", async () => {
    const testDb = await createTestDatabase();
    disposers.push(() => testDb.cleanup());
    await insertAgent(testDb.client.db, "sync-manifest-adoption");

    await syncCcManagedMcpSpecialistWorkspaces({
      db: testDb.client.db,
      config: testDb.config,
      logger,
    });
    const workspacePath = resolveSpecialistWorkspacePath({
      config: testDb.config,
      slug: "sync-manifest-adoption",
      status: "active",
    });
    const manifestPath = join(workspacePath, ".opencode", "skills", ".cc-managed.json");

    await rm(manifestPath);

    const updatedCount = await syncCcManagedMcpSpecialistWorkspaces({
      db: testDb.client.db,
      config: testDb.config,
      logger,
    });

    expect(updatedCount).toBe(1);
    await expect(readFile(manifestPath, "utf8")).resolves.toContain('"version": 1');
  });
});
