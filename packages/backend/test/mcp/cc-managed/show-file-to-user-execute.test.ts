import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppDb } from "../../../src/db/client";
import { agents } from "../../../src/db/schema/index";
import { createShowFileToUserDefinition } from "../../../src/mcp/cc-managed/groups/cc-default/tools/show-file-to-user";
import { createMockOpenCodeService } from "../../helpers/fake-opencode";
import { createTestDatabase } from "../../helpers/db";

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
    name: "Preview Specialist",
    role: "show files",
    instructions: "Be useful.",
    default_model: "openai/gpt-4.1",
    icon_path: null,
    status: "active",
    capabilities_json: "{}",
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: null,
  });
}

async function setup(decision: unknown = { action: "opened", values: {} }) {
  const testDb = await createTestDatabase();
  disposers.push(() => testDb.cleanup());
  const liveRequestService = { create: vi.fn(() => Promise.resolve(decision)) };
  const tool = createShowFileToUserDefinition({
    db: testDb.client.db,
    config: testDb.config,
    opencodeService: createMockOpenCodeService(),
    liveRequestService: liveRequestService as never,
  });
  return { testDb, tool, liveRequestService };
}

const ctx = { agentSlug: "preview" };

describe("show_file_to_user execute", () => {
  it("opens a specialist-relative file in the operator preview pane", async () => {
    const { testDb, tool, liveRequestService } = await setup();
    await insertAgent(testDb.client.db, ctx.agentSlug);

    const result = await tool.execute({ path: "reports/output.md", title: "Report" }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ path: "reports/output.md", shown: true });
    expect(liveRequestService.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { path: "reports/output.md" } }),
    );
  });

  it("errors when the calling specialist is unknown", async () => {
    const { tool } = await setup();
    const result = await tool.execute({ path: "x.md" }, { agentSlug: "ghost" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("ghost");
  });

  it("errors when the path escapes the specialist workspace", async () => {
    const { testDb, tool } = await setup();
    await insertAgent(testDb.client.db, ctx.agentSlug);
    const result = await tool.execute({ path: "/etc/passwd" }, ctx);
    expect(result.isError).toBe(true);
  });
});
