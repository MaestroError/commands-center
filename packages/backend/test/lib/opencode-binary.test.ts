import { chmod, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  resolveOpencodeBinary,
  resolveOpencodePackageJsonPath,
} from "../../src/lib/opencode-binary";
import { loadRuntimeConfig } from "../../src/lib/runtime-config";

describe("resolveOpencodeBinary", () => {
  it("uses CC_OPENCODE_PATH when provided", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-opencode-override-"));
    const bin = join(cwd, "tools", "opencode");

    try {
      await mkdir(join(cwd, "tools"), { recursive: true });
      await writeFile(bin, "#!/bin/sh\nexit 0\n");
      await chmod(bin, 0o755);

      const config = loadRuntimeConfig({
        cwd,
        env: {
          NODE_ENV: "test",
          CC_OPENCODE_PATH: "tools/opencode",
        },
      });

      await expect(resolveOpencodeBinary(config)).resolves.toEqual({
        path: bin,
        source: "override",
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("resolves the binary from the CommandsCenter opencode-ai dependency", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-opencode-dep-"));
    const packageRoot = join(cwd, "node_modules", "opencode-ai");
    const bin = join(packageRoot, "bin", "opencode.js");

    try {
      await mkdir(join(packageRoot, "bin"), { recursive: true });
      await writeFile(
        join(packageRoot, "package.json"),
        JSON.stringify({
          name: "opencode-ai",
          bin: {
            opencode: "bin/opencode.js",
          },
        }),
      );
      await writeFile(bin, "#!/usr/bin/env node\n");

      const config = loadRuntimeConfig({
        cwd,
        env: {
          NODE_ENV: "test",
        },
      });

      await expect(resolveOpencodeBinary(config)).resolves.toMatchObject({
        path: expect.stringContaining("/node_modules/opencode-ai/bin/"),
        source: "dependency",
      });
      await expect(readFile(join(packageRoot, "package.json"), "utf8")).resolves.toContain(
        "opencode-ai",
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("prefers the CommandsCenter dependency over a workspace dependency", async () => {
    const root = await mkdtemp(join(tmpdir(), "cc-opencode-precedence-"));
    const cwd = join(root, "workspace");
    const packageDirectory = join(root, "cc-package");
    const workspacePackageRoot = join(cwd, "node_modules", "opencode-ai");
    const ccPackageRoot = join(packageDirectory, "node_modules", "opencode-ai");

    try {
      await writePackageJson(workspacePackageRoot, "1.14.39");
      await writePackageJson(ccPackageRoot, "1.16.2");

      const packageJsonPath = resolveOpencodePackageJsonPath(cwd, packageDirectory);
      const expectedPath = await realpath(join(ccPackageRoot, "package.json"));

      expect(packageJsonPath).toBe(expectedPath);
      await expect(readFile(packageJsonPath, "utf8")).resolves.toContain("1.16.2");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function writePackageJson(packageRoot: string, version: string): Promise<void> {
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({
      name: "opencode-ai",
      version,
      bin: {
        opencode: "bin/opencode.js",
      },
    }),
  );
}
