import { existsSync } from "node:fs";
import { access, constants, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { RuntimeConfig } from "./runtime-config.js";

type OpenCodePackage = {
  bin?: string | Record<string, string>;
};

export type OpenCodeBinary = {
  path: string;
  source: "override" | "dependency";
};

export async function resolveOpencodeBinary(config: RuntimeConfig): Promise<OpenCodeBinary> {
  if (config.opencodePath) {
    const path = isAbsolute(config.opencodePath)
      ? config.opencodePath
      : resolve(config.paths.cwd, config.opencodePath);

    await assertBinaryExists(path, "CC_OPENCODE_PATH");

    return {
      path,
      source: "override",
    };
  }

  // Search the @cc/backend package's own source dir first so the bundled
  // opencode-ai (declared in `packages/backend/package.json` and resolved
  // through pnpm) wins over any opencode-ai that happens to be hoisted into a
  // parent directory. Falling back to the workspace cwd preserves the
  // historical behavior for installations that have opencode-ai outside the
  // package's own node_modules tree.
  const ownSearchRoot = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = resolveOpencodePackageJsonPath([ownSearchRoot, config.paths.cwd]);

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as OpenCodePackage;
  const relativePath =
    typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.["opencode"];

  if (!relativePath) {
    throw new Error("Resolved `opencode-ai` package does not declare an `opencode` binary.");
  }

  const path = resolve(dirname(packageJsonPath), relativePath);
  await assertBinaryExists(path, "the resolved opencode dependency binary");

  return {
    path,
    source: "dependency",
  };
}

/**
 * Exported for testability. Walks up from each search root, in order, and
 * returns the first `<root>/node_modules/opencode-ai/package.json` it finds
 * by direct filesystem check. Throws if no root has the package installed.
 *
 * Implemented with an explicit `node_modules/<pkg>/package.json` walk instead
 * of `require.resolve(..., { paths })` so the search is deterministic and
 * cannot fall through to the caller's own module resolution (which on
 * pnpm-installed workspaces would find the package via a different path and
 * silently shadow the intended search root).
 */
export function resolveOpencodePackageJsonPath(searchRoots: string[]): string {
  for (const root of searchRoots) {
    const found = findOpencodePackageJsonFrom(root);
    if (found) {
      return found;
    }
  }

  throw new Error(
    "Unable to resolve the OpenCode binary from project dependencies. Install `opencode-ai` in the workspace or set CC_OPENCODE_PATH.",
  );
}

function findOpencodePackageJsonFrom(start: string): string | undefined {
  let current = start;
  while (true) {
    const candidate = join(current, "node_modules", "opencode-ai", "package.json");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function assertBinaryExists(path: string, source: string): Promise<void> {
  try {
    await access(path, constants.F_OK);
  } catch {
    throw new Error(`Unable to access ${source} at ${path}`);
  }
}
