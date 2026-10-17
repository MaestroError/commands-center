import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const XDG_STATE_SUBDIRECTORIES = {
  XDG_DATA_HOME: "data",
  XDG_CONFIG_HOME: "config",
  XDG_CACHE_HOME: "cache",
  XDG_STATE_HOME: "state",
} as const;

export function buildOpenCodeStateEnv(stateDir: string | undefined): NodeJS.ProcessEnv {
  if (!stateDir) {
    return {};
  }

  const env: NodeJS.ProcessEnv = {};
  for (const [variable, subdirectory] of Object.entries(XDG_STATE_SUBDIRECTORIES)) {
    env[variable] = join(stateDir, subdirectory);
  }

  return env;
}

export function buildNpmCacheEnv(npmCacheDir: string | undefined): NodeJS.ProcessEnv {
  return npmCacheDir ? { NPM_CONFIG_CACHE: npmCacheDir } : {};
}

export async function ensureOpenCodeStateDirs(stateDir: string | undefined): Promise<void> {
  if (!stateDir) {
    return;
  }

  const directories = Object.values(buildOpenCodeStateEnv(stateDir)).filter(
    (value): value is string => typeof value === "string",
  );

  await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));
}

export async function ensureNpmCacheDir(npmCacheDir: string | undefined): Promise<void> {
  if (!npmCacheDir) {
    return;
  }

  await mkdir(npmCacheDir, { recursive: true });
}
