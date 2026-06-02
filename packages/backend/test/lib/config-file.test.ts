import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { readConfigFile, writeConfigFileAtomic } from "../../src/lib/config-file";

const testSchema = z.object({ version: z.number(), name: z.string() });

async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "cc-config-file-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("readConfigFile", () => {
  it("returns null for a missing file", async () => {
    await withTmpDir(async (dir) => {
      const result = await readConfigFile(join(dir, "missing.json"), testSchema);
      expect(result).toBeNull();
    });
  });

  it("parses and returns a valid config file", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "config.json");
      await writeFile(path, JSON.stringify({ version: 1, name: "hello" }), "utf8");

      const result = await readConfigFile(path, testSchema);
      expect(result).toEqual({ version: 1, name: "hello" });
    });
  });

  it("returns null and logs for invalid JSON", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "bad.json");
      await writeFile(path, "{ not valid json", "utf8");

      const error = vi.fn();
      const result = await readConfigFile(path, testSchema, { error } as never);

      expect(result).toBeNull();
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ path }),
        expect.stringContaining("invalid JSON"),
      );
    });
  });

  it("returns null and logs when the value fails schema validation", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "wrong-shape.json");
      await writeFile(path, JSON.stringify({ version: "not-a-number", name: 42 }), "utf8");

      const error = vi.fn();
      const result = await readConfigFile(path, testSchema, { error } as never);

      expect(result).toBeNull();
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ path, issues: expect.any(Array) }),
        expect.stringContaining("schema validation"),
      );
    });
  });

  it("rethrows unexpected I/O errors", async () => {
    await withTmpDir(async (dir) => {
      // Create a directory at the path so readFile throws EISDIR, not ENOENT
      const path = join(dir, "not-a-file");
      await mkdir(path);

      await expect(readConfigFile(path, testSchema)).rejects.toThrow();
    });
  });
});

describe("writeConfigFileAtomic", () => {
  it("writes the expected JSON content to the target path", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "out.json");
      await writeConfigFileAtomic(path, { version: 1, name: "test" });

      const raw = await readFile(path, "utf8");
      expect(JSON.parse(raw)).toEqual({ version: 1, name: "test" });
    });
  });

  it("does not leave a .tmp file after a successful write", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "out.json");
      await writeConfigFileAtomic(path, { version: 1, name: "test" });

      await expect(readFile(`${path}.tmp`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("creates parent directories that do not yet exist", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "nested", "deep", "config.json");
      await writeConfigFileAtomic(path, { version: 1, name: "nested" });

      const raw = await readFile(path, "utf8");
      expect(JSON.parse(raw)).toEqual({ version: 1, name: "nested" });
    });
  });

  it("overwrites an existing file atomically", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "config.json");
      await writeConfigFileAtomic(path, { version: 1, name: "first" });
      await writeConfigFileAtomic(path, { version: 2, name: "second" });

      const raw = await readFile(path, "utf8");
      expect(JSON.parse(raw)).toEqual({ version: 2, name: "second" });
    });
  });
});
