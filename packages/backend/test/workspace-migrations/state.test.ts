import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import {
  readWorkspaceMigrationState,
  workspaceMigrationStatePath,
  writeWorkspaceMigrationState,
} from "../../src/workspace-migrations/state";

async function withConfig(
  fn: (config: ReturnType<typeof loadRuntimeConfig>) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "cc-workspace-migrations-"));

  try {
    await fn(loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } }));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

describe("workspace migration state", () => {
  it("returns an empty state when the file is missing", async () => {
    await withConfig(async (config) => {
      await expect(readWorkspaceMigrationState(config)).resolves.toEqual({
        version: 1,
        applied: [],
      });
    });
  });

  it("writes and reads valid state", async () => {
    await withConfig(async (config) => {
      await writeWorkspaceMigrationState(config, {
        version: 1,
        applied: [
          {
            id: "0001-example",
            description: "Example",
            appliedAt: "2026-06-14T00:00:00.000Z",
          },
        ],
      });

      await expect(readWorkspaceMigrationState(config)).resolves.toEqual({
        version: 1,
        applied: [
          {
            id: "0001-example",
            description: "Example",
            appliedAt: "2026-06-14T00:00:00.000Z",
          },
        ],
      });
    });
  });

  it("does not leave a temp file after a successful write", async () => {
    await withConfig(async (config) => {
      const path = workspaceMigrationStatePath(config);

      await writeWorkspaceMigrationState(config, { version: 1, applied: [] });

      await expect(readFile(`${path}.tmp`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("rejects invalid JSON state", async () => {
    await withConfig(async (config) => {
      const path = workspaceMigrationStatePath(config);
      const logger = { error: vi.fn() };
      await writeFile(path, "{ nope", "utf8").catch(async (error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await writeWorkspaceMigrationState(config, { version: 1, applied: [] });
        await writeFile(path, "{ nope", "utf8");
      });

      await expect(readWorkspaceMigrationState(config, logger as never)).rejects.toThrow(
        "Workspace migration state contains invalid JSON",
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ path }),
        "workspace migration state contains invalid JSON",
      );
    });
  });

  it("rejects invalid state shape", async () => {
    await withConfig(async (config) => {
      const path = workspaceMigrationStatePath(config);
      const logger = { error: vi.fn() };
      await writeWorkspaceMigrationState(config, { version: 1, applied: [] });
      await writeFile(path, JSON.stringify({ version: 2, applied: [] }), "utf8");

      await expect(readWorkspaceMigrationState(config, logger as never)).rejects.toThrow(
        "Workspace migration state failed schema validation",
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ path, issues: expect.any(Array) }),
        "workspace migration state failed schema validation",
      );
    });
  });
});
