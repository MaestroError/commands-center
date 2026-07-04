import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppDb } from "../../../src/db/client";
import { agents } from "../../../src/db/schema/index";
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
});
