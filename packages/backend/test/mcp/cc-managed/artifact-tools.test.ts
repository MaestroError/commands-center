import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type { AppDb } from "../../../src/db/client";
import { agents, conversations } from "../../../src/db/schema/index";
import { createArtifactToolDefinitions } from "../../../src/mcp/cc-managed/groups/cc-default/tools/artifact-tools";
import { createTestDatabase } from "../../helpers/db";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) {
    await disposers.pop()?.();
  }
});

async function insertAgent(db: AppDb, slug: string): Promise<string> {
  const id = `agent-${randomUUID()}`;
  const timestamp = new Date();
  await db.insert(agents).values({
    id,
    slug,
    name: "Artifact Specialist",
    role: "produce artifacts",
    instructions: "Be useful.",
    default_model: "openai/gpt-4.1",
    icon_path: null,
    status: "active",
    capabilities_json: "{}",
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: null,
  });
  return id;
}

async function insertCurrentChat(db: AppDb, agentId: string): Promise<void> {
  const timestamp = new Date();
  await db.insert(conversations).values({
    id: `conv-${randomUUID()}`,
    agent_id: agentId,
    opencode_session_id: `session-${randomUUID()}`,
    title: null,
    status: "active",
    source: "chat",
    is_current: true,
    task_run_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });
}

async function setup() {
  const testDb = await createTestDatabase();
  disposers.push(() => testDb.cleanup());
  const [tool] = createArtifactToolDefinitions({ db: testDb.client.db, config: testDb.config });
  return { testDb, tool: tool! };
}

describe("add_artifact", () => {
  it("registers an artifact against the current chat conversation", async () => {
    const { testDb, tool } = await setup();
    const agentId = await insertAgent(testDb.client.db, "reviewer");
    await insertCurrentChat(testDb.client.db, agentId);

    const result = await tool.execute(
      { title: "Release notes", type: "url", link: "https://example.com" },
      { agentSlug: "reviewer" },
    );

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ title: "Release notes", type: "url" });
    expect(result.content[0]?.text).toContain("Registered artifact");
  });

  it("errors when the specialist is unknown", async () => {
    const { tool } = await setup();
    const result = await tool.execute(
      { title: "x", type: "url", link: "https://example.com" },
      { agentSlug: "ghost" },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("ghost");
  });

  it("errors when there is no active chat conversation", async () => {
    const { testDb, tool } = await setup();
    await insertAgent(testDb.client.db, "reviewer");
    const result = await tool.execute(
      { title: "x", type: "url", link: "https://example.com" },
      { agentSlug: "reviewer" },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("No active chat conversation");
  });

  it("errors on invalid input", async () => {
    const { tool } = await setup();
    const result = await tool.execute({ title: "" }, { agentSlug: "reviewer" });
    expect(result.isError).toBe(true);
  });
});
