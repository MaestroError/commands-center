import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Maps each XDG base-directory variable OpenCode honors to the subdirectory it
 * gets under `CC_OPENCODE_STATE_DIR`. Separate roots are required: OpenCode
 * appends its own `opencode/` segment to each, so a shared root would merge data,
 * config, cache, and state into one directory. `XDG_STATE_HOME` is ignored by
 * OpenCode 1.16.x and used from 1.17.x onward; injecting it is a harmless no-op
 * on older engines.
 */
const XDG_STATE_SUBDIRECTORIES = {
  XDG_DATA_HOME: "data",
  XDG_CONFIG_HOME: "config",
  XDG_CACHE_HOME: "cache",
  XDG_STATE_HOME: "state",
} as const;

/**
 * Builds the XDG environment overrides that redirect the managed `opencode serve`
 * child's global state under `stateDir`. Returns an empty object when `stateDir`
 * is undefined so the child keeps OpenCode's default `$HOME`-derived paths.
 *
 * Pure function: no filesystem side effects. Spread these entries last into the
 * child environment so they win over any ambient `XDG_*` variables inherited from
 * the container/shell.
 */
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

/**
 * Creates the XDG root directories under `stateDir` so OpenCode can write into
 * them on first boot. No-op when `stateDir` is undefined. OpenCode also creates
 * its own subdirectories on startup; this just guarantees the roots exist.
 */
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
