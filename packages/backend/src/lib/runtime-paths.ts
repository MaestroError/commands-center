import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import type { RuntimeConfig } from "./runtime-config.js";

export async function bootstrapWorkspaceRoot(config: RuntimeConfig): Promise<void> {
  await mkdir(config.paths.workspaceDir, { recursive: true });
  await mkdir(resolve(config.paths.workspaceDir, ".cc-migrations"), { recursive: true });
}

export async function bootstrapRuntimePaths(config: RuntimeConfig): Promise<void> {
  await bootstrapWorkspaceRoot(config);

  await Promise.all(
    Object.values(config.paths.subdirectories).map(async (directoryPath) =>
      mkdir(directoryPath, { recursive: true }),
    ),
  );
}
