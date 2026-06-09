import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import type { RuntimeConfig } from "./runtime-config.js";

const require = createRequire(import.meta.url);

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
 * returns the first `opencode-ai/package.json` it finds. Throws if no root
 * has the package installed.
 */
export function resolveOpencodePackageJsonPath(searchRoots: string[]): string {
  for (const root of searchRoots) {
    try {
      return require.resolve("opencode-ai/package.json", { paths: [root] });
    } catch {
      // try next root
    }
  }

  throw new Error(
    "Unable to resolve the OpenCode binary from project dependencies. Install `opencode-ai` in the workspace or set CC_OPENCODE_PATH.",
  );
}

async function assertBinaryExists(path: string, source: string): Promise<void> {
  try {
    await access(path, constants.F_OK);
  } catch {
    throw new Error(`Unable to access ${source} at ${path}`);
  }
}
