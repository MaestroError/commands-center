import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { RuntimeConfig } from "./runtime-config.js";
import { DEFAULT_WORKSPACE_GITIGNORE } from "./workspace-gitignore.js";

export async function bootstrapWorkspaceRoot(config: RuntimeConfig): Promise<void> {
  const created = await mkdir(config.paths.workspaceDir, { recursive: true });
  if (created !== undefined) {
    try {
      await writeFile(
        resolve(config.paths.workspaceDir, ".gitignore"),
        DEFAULT_WORKSPACE_GITIGNORE,
        {
          flag: "wx",
        },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
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
