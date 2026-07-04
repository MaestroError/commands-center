import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import { bootstrapRuntimePaths, bootstrapWorkspaceRoot } from "../../src/lib/runtime-paths";

describe("bootstrapRuntimePaths", () => {
  it("creates only the workspace root and migration metadata directory for pre-migration boot", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-runtime-"));

    try {
      const config = loadRuntimeConfig({
        cwd,
        env: {
          NODE_ENV: "test",
        },
      });

      await bootstrapWorkspaceRoot(config);

      await expect(stat(config.paths.workspaceDir)).resolves.toBeDefined();
      await expect(stat(join(config.paths.workspaceDir, ".cc-migrations"))).resolves.toBeDefined();
      await expect(stat(config.paths.subdirectories.specialists)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("creates the app root, workspace root, and required portable state directories", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-runtime-"));

    try {
      const config = loadRuntimeConfig({
        cwd,
        env: {
          NODE_ENV: "test",
        },
      });

      await bootstrapRuntimePaths(config);

      await expect(stat(config.paths.workspaceDir)).resolves.toBeDefined();
      await expect(stat(join(config.paths.workspaceDir, "mcp"))).rejects.toMatchObject({
        code: "ENOENT",
      });

      for (const directoryPath of Object.values(config.paths.subdirectories)) {
        await expect(stat(directoryPath)).resolves.toBeDefined();
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
