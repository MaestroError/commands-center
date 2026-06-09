import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

  it("resolves the binary from the @cc/backend package's own node_modules", async () => {
    // The real @cc/backend package depends on opencode-ai and pnpm symlinks it
    // into packages/backend/node_modules/opencode-ai. This test exercises the
    // production search path: the package's own source dir (the file the test
    // is run from resolves to under packages/backend/), which walks up to
    // packages/backend/node_modules and finds the symlink.
    const config = loadRuntimeConfig({
      cwd: tmpdir(),
      env: { NODE_ENV: "test" },
    });

    const result = await resolveOpencodeBinary(config);

    expect(result.source).toBe("dependency");
    expect(result.path).toMatch(/node_modules\/opencode-ai\/bin\//);
  });
});

describe("resolveOpencodePackageJsonPath", () => {
  it("returns the first matching root in order", async () => {
    const firstRoot = await mkdtemp(join(tmpdir(), "cc-opencode-first-"));
    const secondRoot = await mkdtemp(join(tmpdir(), "cc-opencode-second-"));
    const firstPackage = join(firstRoot, "node_modules", "opencode-ai");
    const secondPackage = join(secondRoot, "node_modules", "opencode-ai");

    try {
      await mkdir(join(firstPackage, "bin"), { recursive: true });
      await writeFile(
        join(firstPackage, "package.json"),
        JSON.stringify({ name: "opencode-ai", bin: { opencode: "bin/opencode" } }),
      );
      await writeFile(join(firstPackage, "bin", "opencode"), "#!/bin/sh\nexit 0\n");

      await mkdir(join(secondPackage, "bin"), { recursive: true });
      await writeFile(
        join(secondPackage, "package.json"),
        JSON.stringify({ name: "opencode-ai", bin: { opencode: "bin/opencode" } }),
      );
      await writeFile(join(secondPackage, "bin", "opencode"), "#!/bin/sh\nexit 0\n");

      expect(resolveOpencodePackageJsonPath([firstRoot, secondRoot])).toContain(firstPackage);
    } finally {
      await rm(firstRoot, { recursive: true, force: true });
      await rm(secondRoot, { recursive: true, force: true });
    }
  });

  it("falls back to a later root when the earlier one has no opencode-ai installed", async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), "cc-opencode-empty-"));
    const fallbackRoot = await mkdtemp(join(tmpdir(), "cc-opencode-fallback-"));
    const fallbackPackage = join(fallbackRoot, "node_modules", "opencode-ai");

    try {
      await mkdir(join(fallbackPackage, "bin"), { recursive: true });
      await writeFile(
        join(fallbackPackage, "package.json"),
        JSON.stringify({ name: "opencode-ai", bin: { opencode: "bin/opencode" } }),
      );
      await writeFile(join(fallbackPackage, "bin", "opencode"), "#!/bin/sh\nexit 0\n");

      expect(resolveOpencodePackageJsonPath([emptyRoot, fallbackRoot])).toContain(fallbackPackage);
    } finally {
      await rm(emptyRoot, { recursive: true, force: true });
      await rm(fallbackRoot, { recursive: true, force: true });
    }
  });

  it("throws when no root has opencode-ai installed", async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), "cc-opencode-empty-"));

    try {
      expect(() => resolveOpencodePackageJsonPath([emptyRoot])).toThrow(
        /Unable to resolve the OpenCode binary/,
      );
    } finally {
      await rm(emptyRoot, { recursive: true, force: true });
    }
  });
});
