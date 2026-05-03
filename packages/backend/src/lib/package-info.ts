import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const packageInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  engines: z
    .object({
      node: z.string().min(1).optional(),
    })
    .optional(),
});

export type PackageInfo = z.infer<typeof packageInfoSchema> & {
  packageRoot: string;
};

const fallbackPackageInfo = {
  name: "commandscenter",
  version: "0.0.0",
  packageRoot: dirname(fileURLToPath(import.meta.url)),
} satisfies PackageInfo;

export function readPackageInfo(startDir = dirname(fileURLToPath(import.meta.url))): PackageInfo {
  const packagePath = findPackageJson(startDir);

  if (!packagePath) {
    return fallbackPackageInfo;
  }

  return {
    ...packageInfoSchema.parse(JSON.parse(readFileSync(packagePath, "utf8"))),
    packageRoot: dirname(packagePath),
  };
}

function findPackageJson(startDir: string): string | undefined {
  let currentDir = startDir;

  for (let depth = 0; depth < 8; depth++) {
    const candidate = resolve(currentDir, "package.json");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(currentDir);

    if (parent === currentDir) {
      return undefined;
    }

    currentDir = parent;
  }

  return undefined;
}
