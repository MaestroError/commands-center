import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function loadEnvFile(path: string, env: NodeJS.ProcessEnv = process.env): void {
  const resolvedPath = resolve(path);
  const content = readFileSync(resolvedPath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!key || env[key] !== undefined) {
      continue;
    }

    env[key] = unquoteEnvValue(value);
  }
}

export function loadDefaultEnvFile(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): string | undefined {
  const env = options?.env ?? process.env;
  const cwd = options?.cwd ?? env["INIT_CWD"] ?? process.cwd();
  const path = findDefaultEnvFile(cwd);

  if (!path) {
    return undefined;
  }

  loadEnvFile(path, env);
  return path;
}

function findDefaultEnvFile(cwd: string): string | undefined {
  let current = resolve(cwd);

  while (true) {
    const path = resolve(current, ".env");

    if (existsSync(path)) {
      return path;
    }

    const parent = dirname(current);

    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
