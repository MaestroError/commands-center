import { execFileSync } from "node:child_process";
import { mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createEmbeddedOpenCodeHost,
  type EmbeddedOpenCodeHost,
} from "../../src/opencode/embedded-host.js";
import { createEmbeddedFileService } from "../../src/opencode/embedded-file-service.js";
import { createTestDatabase } from "../helpers/db.js";

describe("embedded workspace files", () => {
  const originalEnv = { ...process.env };
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let host: EmbeddedOpenCodeHost;
  let files: ReturnType<typeof createEmbeddedFileService>;
  let directory: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    const workspace = await realpath(db.config.paths.workspaceDir);
    directory = join(workspace, "specialist");
    await mkdir(directory);
    await writeFile(join(directory, "example.txt"), "hello from v2\n");
    await writeFile(join(directory, "image.png"), Buffer.from([0x89, 0x50, 0, 1]));
    await writeFile(join(workspace, "outside.txt"), "outside");
    await symlink(join(workspace, "outside.txt"), join(directory, "escape.txt"));
    const gitDirectory = join(workspace, "repository");
    await mkdir(gitDirectory);
    execFileSync("git", ["init", "--quiet", gitDirectory]);
    execFileSync("git", [
      "-C",
      gitDirectory,
      "remote",
      "add",
      "origin",
      "https://example.invalid/cc/files-test.git",
    ]);
    await writeFile(join(gitDirectory, "added.txt"), "new file\n");
    process.env["OPENCODE_TEST_HOME"] = workspace;
    host = await createEmbeddedOpenCodeHost({
      workspaceDirectory: workspace,
      sdkOptions: { models: { fetch: false }, fs: { filewatcher: false, fff: false } },
    });
    files = createEmbeddedFileService({ host, config: db.config });
  }, 30000);

  afterAll(async () => {
    await host?.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    await db?.cleanup();
  });

  it("finds native filename matches", async () => {
    expect(await files.findFiles(directory, { query: "example", type: "file" })).toEqual([
      "example.txt",
    ]);
  });
  it("reads text outside a Git repository", async () => {
    expect(await files.readFile(directory, "example.txt")).toMatchObject({
      type: "text",
      content: "hello from v2\n",
    });
  });
  it("encodes binary content for the browser", async () => {
    expect(await files.readFile(directory, "image.png")).toMatchObject({
      type: "binary",
      encoding: "base64",
      content: Buffer.from([0x89, 0x50, 0, 1]).toString("base64"),
    });
  });
  it("rejects traversal outside the specialist directory", async () => {
    await expect(files.readFile(directory, "../outside.txt")).rejects.toThrow("outside");
  });
  it("rejects symlinks outside the specialist directory", async () => {
    await expect(files.readFile(directory, "escape.txt")).rejects.toThrow("outside");
  });
  it("returns not found for a missing file", async () => {
    await expect(files.readFile(directory, "missing.txt")).rejects.toThrow("File not found");
  });
  it("excludes symlink escapes from filename results", async () => {
    expect(await files.findFiles(directory, { query: "escape", type: "file" })).toEqual([]);
  });
  it("omits deleted entries from the SDK's cached index", async () => {
    const isolated = join(directory, "cached");
    await mkdir(isolated);
    await writeFile(join(isolated, "removed.txt"), "delete me");
    await files.findFiles(isolated, { query: "removed" });
    await rm(join(isolated, "removed.txt"));
    expect(await files.findFiles(isolated, { query: "removed" })).toEqual([]);
  });
  it("returns no status for a non-Git directory", async () => {
    expect(await files.getFileStatus(directory)).toEqual([]);
  });
  it("maps native Git status to the CC contract", async () => {
    const gitDirectory = join(await realpath(db.config.paths.workspaceDir), "repository");
    expect(await files.getFileStatus(gitDirectory)).toContainEqual({
      path: "added.txt",
      status: "added",
      added: 1,
      removed: 0,
    });
  });
  it("returns the working diff for a newly added file", async () => {
    const gitDirectory = join(await realpath(db.config.paths.workspaceDir), "repository");
    expect((await files.readFile(gitDirectory, "added.txt")).diff).toContain("+new file");
  });
  it("scopes Git status paths to a specialist inside a repository", async () => {
    const nested = join(await realpath(db.config.paths.workspaceDir), "repository", "nested");
    await mkdir(nested);
    await writeFile(join(nested, "inside.txt"), "nested file\n");
    expect(await files.getFileStatus(nested)).toEqual([
      { path: "inside.txt", status: "added", added: 1, removed: 0 },
    ]);
  });

  it("refreshes native filename results after a new file is created", async () => {
    const isolated = join(directory, "refreshed");
    await mkdir(isolated);
    await files.findFiles(isolated, { query: "fresh" });
    await writeFile(join(isolated, "fresh.txt"), "fresh content");
    await expect
      .poll(() => files.findFiles(isolated, { query: "fresh", type: "file" }), { timeout: 15000 })
      .toEqual(["fresh.txt"]);
  }, 20000);
});
