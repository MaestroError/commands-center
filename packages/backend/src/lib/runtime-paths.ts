import { mkdir } from "node:fs/promises";

import type { RuntimeConfig } from "./runtime-config.js";

export async function bootstrapRuntimePaths(config: RuntimeConfig): Promise<void> {
  await mkdir(config.paths.dataDir, { recursive: true });
  await mkdir(config.paths.workspaceDir, { recursive: true });

  await Promise.all(
    Object.values(config.paths.subdirectories).map(async (directoryPath) =>
      mkdir(directoryPath, { recursive: true }),
    ),
  );
}
