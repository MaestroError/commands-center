import { describe, expect, it, vi } from "vitest";

import { createCopyCustomToolToSpecialistDefinition } from "../../../src/mcp/cc-managed/groups/cc-tool-management/tools/copy-custom-tool-to-specialist";

const ctx = { agentSlug: "reviewer" };

function conflict() {
  return {
    status: "conflict" as const,
    conflict: {
      toolSlug: "formatter",
      toolName: "Formatter",
      agentId: "agent-1",
      agentSlug: "reviewer",
      currentName: "Formatter",
      message: "A tool named 'Formatter' already exists.",
    },
  };
}

function copied(overwritten: boolean) {
  return {
    status: "copied" as const,
    destinationSlug: "formatter",
    result: { copied: [{ overwritten }] },
  };
}

describe("copy_custom_tool_to_specialist", () => {
  it("copies a tool without conflict", async () => {
    const copyGlobalToolToAgent = vi.fn().mockResolvedValue(copied(false));
    const tool = createCopyCustomToolToSpecialistDefinition({
      customToolActionService: { copyGlobalToolToAgent } as never,
    });

    const result = (await tool.execute({ toolSlug: "formatter" }, ctx)) as {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      toolSlug: "formatter",
      destinationSlug: "formatter",
      specialistSlug: "reviewer",
      overwritten: false,
    });
    expect(copyGlobalToolToAgent).toHaveBeenCalledWith({
      slug: "formatter",
      agentSlug: "reviewer",
      overwrite: false,
    });
  });

  it("errors on conflict when no live-request service is available", async () => {
    const copyGlobalToolToAgent = vi.fn().mockResolvedValue(conflict());
    const tool = createCopyCustomToolToSpecialistDefinition({
      customToolActionService: { copyGlobalToolToAgent } as never,
    });

    const result = (await tool.execute({ toolSlug: "formatter" }, ctx)) as {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("already exists");
  });

  it("resolves a conflict by rewriting after operator confirmation", async () => {
    const copyGlobalToolToAgent = vi
      .fn()
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(copied(true));
    const conversationService = {
      resolveCurrent: vi.fn().mockResolvedValue({ current: { id: "conv-1" } }),
    };
    const liveRequestService = {
      create: vi
        .fn()
        .mockResolvedValue({ action: "rewrite", values: { destinationName: "Formatter" } }),
    };
    const tool = createCopyCustomToolToSpecialistDefinition({
      customToolActionService: { copyGlobalToolToAgent } as never,
      conversationService: conversationService as never,
      liveRequestService: liveRequestService as never,
    });

    const result = (await tool.execute({ toolSlug: "formatter" }, ctx)) as {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ overwritten: true });
    // Rewrite means no destinationName override, overwrite true.
    expect(copyGlobalToolToAgent).toHaveBeenLastCalledWith({
      slug: "formatter",
      agentSlug: "reviewer",
      destinationName: undefined,
      overwrite: true,
    });
  });

  it("resolves a conflict by renaming the copy", async () => {
    const copyGlobalToolToAgent = vi
      .fn()
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce({
        status: "copied" as const,
        destinationSlug: "formatter-2",
        result: { copied: [{ overwritten: false }] },
      });
    const tool = createCopyCustomToolToSpecialistDefinition({
      customToolActionService: { copyGlobalToolToAgent } as never,
      conversationService: {
        resolveCurrent: vi.fn().mockResolvedValue({ current: { id: "conv-1" } }),
      } as never,
      liveRequestService: {
        create: vi
          .fn()
          .mockResolvedValue({ action: "rename", values: { destinationName: "Formatter 2" } }),
      } as never,
    });

    const result = (await tool.execute({ toolSlug: "formatter" }, ctx)) as {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content: Array<{ text: string }>;
    };
    expect(result.structuredContent).toMatchObject({ destinationSlug: "formatter-2" });
    expect(copyGlobalToolToAgent).toHaveBeenLastCalledWith({
      slug: "formatter",
      agentSlug: "reviewer",
      destinationName: "Formatter 2",
      overwrite: false,
    });
  });

  it("errors when the second attempt still conflicts", async () => {
    const copyGlobalToolToAgent = vi
      .fn()
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(conflict());
    const tool = createCopyCustomToolToSpecialistDefinition({
      customToolActionService: { copyGlobalToolToAgent } as never,
      conversationService: {
        resolveCurrent: vi.fn().mockResolvedValue({ current: { id: "conv-1" } }),
      } as never,
      liveRequestService: {
        create: vi
          .fn()
          .mockResolvedValue({ action: "rewrite", values: { destinationName: "Formatter" } }),
      } as never,
    });

    const result = (await tool.execute({ toolSlug: "formatter" }, ctx)) as {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBe(true);
  });

  it("errors on invalid input", async () => {
    const tool = createCopyCustomToolToSpecialistDefinition({
      customToolActionService: { copyGlobalToolToAgent: vi.fn() } as never,
    });
    const invalid = (await tool.execute({}, ctx)) as { isError?: boolean };
    expect(invalid.isError).toBe(true);
  });
});
