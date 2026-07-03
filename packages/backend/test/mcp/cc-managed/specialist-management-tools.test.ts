import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGetSelfProfileToolDefinition,
  createListModelsToolDefinition,
  createListSpecialistsToolDefinition,
  createReadSpecialistProfileToolDefinition,
  createSpecialistLiveToolDefinitions,
  createSpecialistManagementToolDefinitions,
} from "../../../src/mcp/cc-managed/groups/cc-specialist-management/tools/specialist-management-tools";
import { createSpecialistService } from "../../../src/services/specialist-service";
import type { OpenCodeService } from "../../../src/services/opencode-service";
import { createTestDatabase } from "../../helpers/db";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) {
    await disposers.pop()?.();
  }
});

function mockOpenCodeService(): OpenCodeService {
  return {
    dispose: vi.fn(() => Promise.resolve()),
    disposeGlobal: vi.fn(() => Promise.resolve()),
    listMcpStatus: vi.fn(() => Promise.resolve({})),
    listMcpToolIds: vi.fn(() => Promise.resolve([])),
    listProviders: vi.fn(() =>
      Promise.resolve({
        all: [
          {
            id: "openai",
            name: "OpenAI",
            source: "api",
            env: [],
            models: { "gpt-4.1": { name: "GPT-4.1" } },
          },
        ],
        default: { openai: "openai/gpt-4.1" },
        connected: ["openai"],
      }),
    ),
  } as unknown as OpenCodeService;
}

async function setup() {
  const testDb = await createTestDatabase();
  disposers.push(() => testDb.cleanup());
  const agentService = createSpecialistService({
    db: testDb.client.db,
    config: testDb.config,
    opencodeService: mockOpenCodeService(),
  });
  return { testDb, agentService };
}

async function createCaller(agentService: ReturnType<typeof createSpecialistService>) {
  const caller = await agentService.create({
    name: "Caller Specialist",
    role: "call tools",
    instructions: "Invoke tools.",
    defaultModel: "openai/gpt-4.1",
    capabilities: {},
  });
  return { agentSlug: caller.slug };
}

describe("specialist management tools", () => {
  it("gets self profile and errors when the calling specialist is unknown", async () => {
    const { agentService } = await setup();
    const created = await agentService.create({
      name: "Self",
      role: "introspect",
      instructions: "Know thyself.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {},
    });

    const tool = createGetSelfProfileToolDefinition({ agentService });
    const ok = await tool.execute({}, { agentSlug: created.slug });
    expect(ok.isError).toBeFalsy();
    expect((ok.structuredContent as { slug: string }).slug).toBe(created.slug);

    const missing = await tool.execute({}, { agentSlug: "ghost" });
    expect(missing.isError).toBe(true);
  });

  it("lists specialists and reads a profile by slug or id", async () => {
    const { agentService } = await setup();
    const created = await agentService.create({
      name: "Readable",
      role: "be read",
      instructions: "Exist.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {},
    });

    const list = createListSpecialistsToolDefinition({ agentService });
    const listed = await list.execute({});
    expect((listed.structuredContent as { specialists: unknown[] }).specialists).toHaveLength(1);

    const read = createReadSpecialistProfileToolDefinition({ agentService });
    expect((await read.execute({ specialist: created.slug })).isError).toBeFalsy();
    expect((await read.execute({ specialist: created.id })).isError).toBeFalsy();
    expect((await read.execute({ specialist: "nobody" })).isError).toBe(true);
  });

  it("lists models from connected providers with optional search", async () => {
    const { agentService } = await setup();
    const tool = createListModelsToolDefinition({ agentService });

    const all = await tool.execute({});
    expect(all.isError).toBeFalsy();
    const filtered = await tool.execute({ search: "gpt" });
    expect(filtered.isError).toBeFalsy();
  });

  it("creates and updates specialists, erroring on unknown update targets", async () => {
    const { agentService } = await setup();
    const [, , createTool, updateTool] = createSpecialistManagementToolDefinitions({
      agentService,
    });

    const created = await createTool.execute({
      name: "Built",
      role: "do work",
      instructions: "Work hard.",
      defaultModel: "openai/gpt-4.1",
    });
    expect(created.isError).toBeFalsy();
    const id = (created.structuredContent as { id: string }).id;

    const updated = await updateTool.execute({ id, input: { name: "Renamed" } });
    expect((updated.structuredContent as { name: string }).name).toBe("Renamed");

    const missing = await updateTool.execute({ id: "nope", input: { name: "X" } });
    expect(missing.isError).toBe(true);
  });
});

describe("specialist live tools", () => {
  function liveTools(
    agentService: ReturnType<typeof createSpecialistService>,
    reviewValues: Record<string, string>,
    confirmable = true,
  ) {
    const conversationService = {
      resolveCurrent: vi.fn(() => Promise.resolve({ current: { id: "conv-1" } })),
    };
    const liveRequestService = {
      create: vi.fn((request: { kind: string }) =>
        Promise.resolve(
          request.kind === "specialist_management_confirmation"
            ? { action: confirmable ? "confirm" : "cancel" }
            : { action: "submit", values: reviewValues },
        ),
      ),
    };
    const tools = createSpecialistLiveToolDefinitions({
      agentService,
      conversationService: conversationService as never,
      liveRequestService: liveRequestService as never,
    });
    return {
      tools,
      byName: (name: string) =>
        tools.find((tool) => tool.name === name)! as unknown as {
          execute: (
            a: unknown,
            c?: { agentSlug: string },
          ) => Promise<{
            isError?: boolean;
            structuredContent?: Record<string, unknown>;
            content: Array<{ text: string }>;
          }>;
        },
    };
  }

  it("drafts a specialist through an operator review", async () => {
    const { agentService } = await setup();
    const ctx = await createCaller(agentService);
    const { byName } = liveTools(agentService, {
      name: "Reviewed Name",
      role: "reviewed role",
      instructions: "reviewed instructions",
      defaultModel: "openai/gpt-4.1",
      iconPath: "",
    });

    const result = await byName("draft_specialist").execute(
      { name: "Proposed", role: "r", instructions: "i", defaultModel: "openai/gpt-4.1" },
      ctx,
    );
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { name: string }).name).toBe("Reviewed Name");
  });

  it("drafts a focused update and errors for a missing target", async () => {
    const { agentService } = await setup();
    const ctx = await createCaller(agentService);
    const existing = await agentService.create({
      name: "Existing",
      role: "worker",
      instructions: "Do work.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {},
    });
    const { byName } = liveTools(agentService, { name: "Focused Rename" });

    const focused = await byName("draft_specialist_update").execute(
      { id: existing.id, input: { name: "Suggested" } },
      ctx,
    );
    expect((focused.structuredContent as { name: string }).name).toBe("Focused Rename");

    const missing = await byName("draft_specialist_update").execute({ id: "nope" }, ctx);
    expect(missing.isError).toBe(true);
  });

  it("surfaces the full editable set when no specialist fields are proposed", async () => {
    const { agentService } = await setup();
    const ctx = await createCaller(agentService);
    const existing = await agentService.create({
      name: "Existing",
      role: "worker",
      instructions: "Do work.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {},
    });
    const { tools } = liveTools(agentService, {
      name: "All",
      role: "all role",
      instructions: "all instructions",
      defaultModel: "openai/gpt-4.1",
      iconPath: "",
    });
    const draftUpdate = tools.find((t) => t.name === "draft_specialist_update")!;
    // No `input` → showAll surfaces every editable field.
    const result = await draftUpdate.execute({ id: existing.id }, ctx);
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { name: string }).name).toBe("All");
  });

  it("removes a specialist after confirmation", async () => {
    const { agentService } = await setup();
    const ctx = await createCaller(agentService);
    const target = await agentService.create({
      name: "Removable",
      role: "temp",
      instructions: "Temporary.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {},
    });
    const { byName } = liveTools(agentService, {});

    const result = await byName("remove_specialist").execute({ id: target.id }, ctx);
    expect(result.isError).toBeFalsy();

    // Removing an unknown specialist errors.
    const missing = await byName("remove_specialist").execute({ id: "nope" }, ctx);
    expect(missing.isError).toBe(true);
  });

  it("errors when live-request infrastructure is unavailable", async () => {
    const { agentService } = await setup();
    const ctx = await createCaller(agentService);
    const tools = createSpecialistLiveToolDefinitions({
      agentService,
    });
    const draft = tools.find((t) => t.name === "draft_specialist")!;
    const result = await draft.execute(
      { name: "P", role: "r", instructions: "i", defaultModel: "openai/gpt-4.1" },
      ctx,
    );
    expect(result.isError).toBe(true);
  });
});
