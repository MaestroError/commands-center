import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import type { AppDb } from "../../../src/db/client";
import { agents, conversations } from "../../../src/db/schema/index";
import { createArtifactToolDefinitions } from "../../../src/mcp/cc-managed/groups/cc-default/tools/artifact-tools";
import { createChatUploadService } from "../../../src/services/chat-upload-service";
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

async function insertCurrentChat(db: AppDb, agentId: string): Promise<string> {
  const timestamp = new Date();
  const id = `conv-${randomUUID()}`;
  await db.insert(conversations).values({
    id,
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
  return id;
}

async function setup() {
  const testDb = await createTestDatabase();
  disposers.push(() => testDb.cleanup());
  const tools = createArtifactToolDefinitions({ db: testDb.client.db, config: testDb.config });
  return { testDb, tools, tool: tools[0]! };
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

describe("list_uploaded_files", () => {
  it("lists only the current specialist chat's uploads newest first", async () => {
    const { testDb, tools } = await setup();
    const agentId = await insertAgent(testDb.client.db, "reviewer");
    const conversationId = await insertCurrentChat(testDb.client.db, agentId);
    const otherAgentId = await insertAgent(testDb.client.db, "other");
    const otherConversationId = await insertCurrentChat(testDb.client.db, otherAgentId);
    const uploadService = createChatUploadService({ config: testDb.config });
    await uploadService.persist({
      agentId,
      conversationId,
      attachments: [attachment("first.txt", "first"), attachment("second.txt", "second")],
    });
    await uploadService.persist({
      agentId: otherAgentId,
      conversationId: otherConversationId,
      attachments: [attachment("private.txt", "private")],
    });

    const result = await tools[1]!.execute({}, { agentSlug: "reviewer" });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      files: [{ filename: "second.txt" }, { filename: "first.txt" }],
    });
    expect(result.content[0]?.text).not.toContain("private.txt");
  });

  it("returns an empty list when the current chat has no uploads", async () => {
    const { testDb, tools } = await setup();
    const agentId = await insertAgent(testDb.client.db, "reviewer");
    await insertCurrentChat(testDb.client.db, agentId);

    const result = await tools[1]!.execute({}, { agentSlug: "reviewer" });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ files: [] });
  });

  it("does not list uploads from an older chat", async () => {
    const { testDb, tools } = await setup();
    const agentId = await insertAgent(testDb.client.db, "reviewer");
    const oldConversationId = await insertCurrentChat(testDb.client.db, agentId);
    await testDb.client.db
      .update(conversations)
      .set({ is_current: false })
      .where(eq(conversations.id, oldConversationId));
    await insertCurrentChat(testDb.client.db, agentId);
    await createChatUploadService({ config: testDb.config }).persist({
      agentId,
      conversationId: oldConversationId,
      attachments: [attachment("historical.txt", "historical")],
    });

    const result = await tools[1]!.execute({}, { agentSlug: "reviewer" });

    expect(result.structuredContent).toEqual({ files: [] });
  });

  it("rejects arguments and unknown specialists", async () => {
    const { tools } = await setup();

    const invalid = await tools[1]!.execute({ conversationId: "other" }, { agentSlug: "ghost" });

    expect(invalid.isError).toBe(true);
    expect(invalid.content[0]?.text).not.toContain("other");
  });
});

function attachment(filename: string, content: string) {
  return {
    type: "document" as const,
    filename,
    mimeType: "text/plain",
    sizeBytes: Buffer.byteLength(content),
    dataUrl: `data:text/plain;base64,${Buffer.from(content).toString("base64")}`,
  };
}
