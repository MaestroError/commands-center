import { lstat, mkdir, readdir, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { WorkspaceMigration } from "../types.js";

export const renameAgentsToSpecialistsMigration = {
  id: "0002-rename-agents-to-specialists",
  description: "Rename CC agent workspace files to specialist workspace files.",
  async up({ config }) {
    const agentsRoot = resolve(config.paths.workspaceDir, "agents");
    const specialistsRoot = resolve(config.paths.workspaceDir, "specialists");

    await moveDirectoryIfNeeded(agentsRoot, specialistsRoot, {
      fromLabel: "agents",
      toLabel: "specialists",
    });
    await renameMetadataFiles(specialistsRoot, "agent.json", "specialist.json");
  },
  async down({ config }) {
    const agentsRoot = resolve(config.paths.workspaceDir, "agents");
    const specialistsRoot = resolve(config.paths.workspaceDir, "specialists");

    await moveDirectoryIfNeeded(specialistsRoot, agentsRoot, {
      fromLabel: "specialists",
      toLabel: "agents",
    });
    await renameMetadataFiles(agentsRoot, "specialist.json", "agent.json");
  },
} satisfies WorkspaceMigration;

async function moveDirectoryIfNeeded(
  fromPath: string,
  toPath: string,
  labels: { fromLabel: string; toLabel: string },
): Promise<void> {
  const fromExists = await directoryExists(fromPath, labels.fromLabel);
  const toExists = await directoryExists(toPath, labels.toLabel);

  if (fromExists && toExists) {
    throw new Error(
      `Cannot rename workspace ${labels.fromLabel} to ${labels.toLabel}: both directories exist.`,
    );
  }

  if (!fromExists) {
    return;
  }

  await mkdir(dirname(toPath), { recursive: true });
  await rename(fromPath, toPath);
}

async function renameMetadataFiles(root: string, fromName: string, toName: string): Promise<void> {
  if (!(await directoryExists(root, root))) {
    return;
  }

  await renameMetadataFilesInDirectory(root, fromName, toName);
}

async function renameMetadataFilesInDirectory(
  directory: string,
  fromName: string,
  toName: string,
): Promise<void> {
  const fromPath = join(directory, fromName);
  const toPath = join(directory, toName);
  const fromExists = await fileExists(fromPath, fromName);
  const toExists = await fileExists(toPath, toName);

  if (fromExists && toExists) {
    throw new Error(`Cannot rename ${fromName} to ${toName}: both files exist in ${directory}.`);
  }

  if (fromExists) {
    await rename(fromPath, toPath);
  }

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    await renameMetadataFilesInDirectory(join(directory, entry.name), fromName, toName);
  }
}

async function directoryExists(path: string, label: string): Promise<boolean> {
  try {
    const stats = await lstat(path);
    if (!stats.isDirectory()) {
      throw new Error(`Expected ${label} to be a directory: ${path}`);
    }

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function fileExists(path: string, label: string): Promise<boolean> {
  try {
    const stats = await lstat(path);
    if (!stats.isFile()) {
      throw new Error(`Expected ${label} to be a file: ${path}`);
    }

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}
