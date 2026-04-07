import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import { bootstrapRuntimePaths } from "../../src/lib/runtime-paths";

describe("bootstrapRuntimePaths", () => {
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

      await expect(stat(config.paths.dataDir)).resolves.toBeDefined();
      await expect(stat(config.paths.workspaceDir)).resolves.toBeDefined();

      for (const directoryPath of Object.values(config.paths.subdirectories)) {
        await expect(stat(directoryPath)).resolves.toBeDefined();
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
