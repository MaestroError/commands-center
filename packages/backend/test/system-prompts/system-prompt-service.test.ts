import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadRuntimeConfig, type RuntimeConfig } from "../../src/lib/runtime-config";
import { createSystemPromptService } from "../../src/system-prompts/system-prompt-service";
import type { SystemPromptRenderContext } from "../../src/system-prompts/types";

let cwd: string;
let config: RuntimeConfig;

const ctx: SystemPromptRenderContext = {
  appName: "CommandsCenter",
  currentDate: "2026-06-23",
  workspaceDir: "/ws",
  conversationId: "conv-1",
  specialist: { name: "Ada", slug: "ada", role: "engineer", instructions: "Be precise." },
  task: { id: "task-1", title: "Ship it", runId: "run-1" },
};

function makeService() {
  return createSystemPromptService({ config });
}

function fileFor(id: string): string {
  return resolve(config.paths.subdirectories.configuration, "system-prompts", `${id}.md`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "cc-system-prompts-"));
  config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("system prompt service", () => {
  it("falls back to the shipped default when no workspace file exists", async () => {
    const service = makeService();
    const { body, isCustomized } = await service.getBody("identity");
    expect(isCustomized).toBe(false);
    expect(body).toContain("{{ SPECIALIST_NAME }}");
    expect(service.getDefaultBody("identity")).toBe(body);
  });

  it("throws NotFoundError for an unknown id", async () => {
    const service = makeService();
    await expect(service.getBody("nope")).rejects.toThrow(/Unknown system prompt/);
  });

  it("saves and reads back a customized body, writing <id>.md", async () => {
    const service = makeService();
    await service.saveBody("identity", "custom body");

    const { body, isCustomized } = await service.getBody("identity");
    expect(body).toBe("custom body");
    expect(isCustomized).toBe(true);
    expect(await readFile(fileFor("identity"), "utf8")).toBe("custom body");
  });

  it("reset deletes the workspace file and restores the default", async () => {
    const service = makeService();
    await service.saveBody("identity", "custom body");
    await service.resetBody("identity");

    expect(await fileExists(fileFor("identity"))).toBe(false);
    const { body, isCustomized } = await service.getBody("identity");
    expect(isCustomized).toBe(false);
    expect(body).toBe(service.getDefaultBody("identity"));
  });

  it("reset on an already-default prompt is a no-op", async () => {
    const service = makeService();
    await expect(service.resetBody("identity")).resolves.toBeUndefined();
  });

  it("rejects an empty body for a required prompt", async () => {
    const service = makeService();
    await expect(service.saveBody("identity", "   ")).rejects.toThrow(/cannot be empty/);
  });

  it("allows an empty body for the optional prompt", async () => {
    const service = makeService();
    await expect(service.saveBody("additional", "")).resolves.toBeUndefined();
  });

  it("rejects a body over the size cap", async () => {
    const service = makeService();
    await expect(service.saveBody("identity", "x".repeat(65_537))).rejects.toThrow(/64 KB/);
  });

  describe("resolveAll (compose)", () => {
    it("composes chat scope in order and renders variables", async () => {
      const service = makeService();
      const { system, prompts } = await service.resolveAll("chat", ctx);

      expect(prompts.map((prompt) => prompt.id)).toEqual(["identity", "global-chat"]);
      expect(system).toContain("You are Ada");
      expect(system).toContain("with a human operator");
      // task-only prompt excluded from chat scope
      expect(prompts.some((prompt) => prompt.id === "global-task")).toBe(false);
    });

    it("composes task scope with the task-run prompt and task variables", async () => {
      const service = makeService();
      const { system, prompts } = await service.resolveAll("task", ctx);

      expect(prompts.map((prompt) => prompt.id)).toEqual(["identity", "global-task"]);
      expect(system).toContain("TaskRunId: run-1");
      expect(system).toContain("call cc_default_set_task_result");
      expect(prompts.some((prompt) => prompt.id === "global-chat")).toBe(false);
    });

    it("drops the optional additional prompt while empty, includes it once filled", async () => {
      const service = makeService();
      const before = await service.resolveAll("chat", ctx);
      expect(before.prompts.some((prompt) => prompt.id === "additional")).toBe(false);

      await service.saveBody("additional", "Always cite sources.");
      const after = await service.resolveAll("chat", ctx);
      expect(after.prompts.some((prompt) => prompt.id === "additional")).toBe(true);
      expect(after.system).toContain("Always cite sources.");
    });

    it("honours per-conversation overrides", async () => {
      const service = makeService();
      const disabled = await service.resolveAll("chat", ctx, { "global-chat": false });
      expect(disabled.prompts.some((prompt) => prompt.id === "global-chat")).toBe(false);
      expect(disabled.prompts.some((prompt) => prompt.id === "identity")).toBe(true);
    });
  });

  describe("listResolved", () => {
    it("keeps disabled and empty entries flagged", async () => {
      const service = makeService();
      const resolved = await service.listResolved("chat", ctx, { "global-chat": false });

      const ids = resolved.map((entry) => entry.id);
      expect(ids).toEqual(["identity", "global-chat", "additional"]);

      const globalChat = resolved.find((entry) => entry.id === "global-chat");
      expect(globalChat?.enabled).toBe(false);

      const additional = resolved.find((entry) => entry.id === "additional");
      expect(additional?.optional).toBe(true);
      expect(additional?.renderedBody).toBe("");
      expect(additional?.isCustomized).toBe(false);
    });

    it("reports customization state", async () => {
      const service = makeService();
      await service.saveBody("identity", "custom");
      const resolved = await service.listResolved("chat", ctx);
      expect(resolved.find((entry) => entry.id === "identity")?.isCustomized).toBe(true);
    });
  });
});
