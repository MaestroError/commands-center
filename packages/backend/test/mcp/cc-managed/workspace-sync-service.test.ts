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

async function insertAgent(
  db: AppDb,
  slug: string,
  options: { status?: "active" | "archived"; workspaceSkills?: string[] } = {},
): Promise<void> {
  const timestamp = new Date();
  const status = options.status ?? "active";
  await db.insert(agents).values({
    id: `agent-${randomUUID()}`,
    slug,
    name: "Sync Specialist",
    role: "sync",
    instructions: "Be useful.",
    default_model: "openai/gpt-4.1",
    icon_path: null,
    status,
    capabilities_json: JSON.stringify({
      builtInSkills: [],
      workspaceSkills: options.workspaceSkills ?? [],
      customTools: [],
      mcpServers: [],
      toolPermissions: [],
      appMcpServers: [],
      appToolPermissions: [],
    }),
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: status === "archived" ? timestamp : null,
  });
}

async function writeLibrarySkill(root: string, slug: string): Promise<void> {
  await mkdir(join(root, slug), { recursive: true });
  await writeFile(
    join(root, slug, "SKILL.md"),
    `---\nname: ${slug}\ndescription: ${slug} helper\n---\n\nBody.\n`,
    "utf8",
  );
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

  it("does not sync archived specialists", async () => {
    const testDb = await createTestDatabase();
    disposers.push(() => testDb.cleanup());
    await insertAgent(testDb.client.db, "sync-archived", { status: "archived" });

    const updatedCount = await syncCcManagedMcpSpecialistWorkspaces({
      db: testDb.client.db,
      config: testDb.config,
      logger,
    });

    expect(updatedCount).toBe(0);
    const archivedPath = resolveSpecialistWorkspacePath({
      config: testDb.config,
      slug: "sync-archived",
      status: "archived",
    });
    await expect(readFile(join(archivedPath, "opencode.jsonc"), "utf8")).rejects.toThrow();
  });

  it("boots past a specialist whose library skill was deleted, keeping its copy", async () => {
    const testDb = await createTestDatabase();
    disposers.push(() => testDb.cleanup());
    const libraryRoot = testDb.config.paths.subdirectories.skills;
    await writeLibrarySkill(libraryRoot, "brief-interpreter");
    await insertAgent(testDb.client.db, "designer-agent", {
      workspaceSkills: ["brief-interpreter"],
    });
    await insertAgent(testDb.client.db, "healthy-agent");

    await syncCcManagedMcpSpecialistWorkspaces({
      db: testDb.client.db,
      config: testDb.config,
      logger,
    });

    // The library skill is deleted while the specialist still selects it.
    await rm(join(libraryRoot, "brief-interpreter"), { recursive: true, force: true });
    const designerPath = resolveSpecialistWorkspacePath({
      config: testDb.config,
      slug: "designer-agent",
      status: "active",
    });
    await rm(join(designerPath, "opencode.jsonc"), { force: true });

    // The sync must complete rather than throwing out of the boot path.
    await expect(
      syncCcManagedMcpSpecialistWorkspaces({
        db: testDb.client.db,
        config: testDb.config,
        logger,
      }),
    ).resolves.toBeGreaterThan(0);

    // The specialist's own copy is the last one left; it must survive.
    await expect(
      readFile(join(designerPath, ".opencode", "skills", "brief-interpreter", "SKILL.md"), "utf8"),
    ).resolves.toContain("brief-interpreter");
    await expect(readFile(join(designerPath, "opencode.jsonc"), "utf8")).resolves.toContain(
      "permission",
    );

    // The unrelated specialist is synced too, not skipped by an early abort.
    const healthyPath = resolveSpecialistWorkspacePath({
      config: testDb.config,
      slug: "healthy-agent",
      status: "active",
    });
    await expect(readFile(join(healthyPath, "opencode.jsonc"), "utf8")).resolves.toContain(
      "permission",
    );
  });
});
