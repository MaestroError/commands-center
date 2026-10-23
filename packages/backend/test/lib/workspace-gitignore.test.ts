import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRuntimeConfig, type RuntimeConfig } from "../../src/lib/runtime-config.js";
import { bootstrapRuntimePaths, bootstrapWorkspaceRoot } from "../../src/lib/runtime-paths.js";

const execFileAsync = promisify(execFile);
let directory: string;
let config: RuntimeConfig;
let ignorePath: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "cc-workspace-ignore-"));
  config = loadRuntimeConfig({ cwd: directory, env: { NODE_ENV: "test" } });
  ignorePath = join(config.paths.workspaceDir, ".gitignore");
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("initial workspace gitignore", () => {
  it("creates an ignore file when bootstrap creates the workspace", async () => {
    await bootstrapRuntimePaths(config);
    expect(await readFile(ignorePath, "utf8")).toContain("/.cc/");
  });

  it("leaves an existing empty workspace without an ignore file", async () => {
    await mkdir(config.paths.workspaceDir, { recursive: true });
    await bootstrapRuntimePaths(config);
    await expect(readFile(ignorePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("leaves an existing populated workspace without an ignore file", async () => {
    await mkdir(config.paths.workspaceDir, { recursive: true });
    await writeFile(join(config.paths.workspaceDir, "notes.md"), "Existing content");
    await bootstrapRuntimePaths(config);
    await expect(readFile(ignorePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves a customized ignore file on later starts", async () => {
    await bootstrapWorkspaceRoot(config);
    await writeFile(ignorePath, "# My choices\nprivate/\n");
    await bootstrapRuntimePaths(config);
    expect(await readFile(ignorePath, "utf8")).toBe("# My choices\nprivate/\n");
  });

  it("does not restore an ignore file removed by the operator", async () => {
    await bootstrapWorkspaceRoot(config);
    await rm(ignorePath);
    await bootstrapRuntimePaths(config);
    await expect(readFile(ignorePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("ignores config credentials when the operator enables the optional rules", async () => {
    await bootstrapRuntimePaths(config);
    const defaults = await readFile(ignorePath, "utf8");
    await writeFile(
      ignorePath,
      defaults
        .replace("# /opencode.jsonc", "/opencode.jsonc")
        .replace("# /specialists/**/opencode.jsonc", "/specialists/**/opencode.jsonc"),
    );
    await execFileAsync("git", ["init", "--quiet", config.paths.workspaceDir]);
    const paths = [
      "opencode.jsonc",
      "specialists/test/opencode.jsonc",
      "specialists/.archived/old/opencode.jsonc",
    ];
    const result = await execFileAsync("git", [
      "-C",
      config.paths.workspaceDir,
      "check-ignore",
      "--no-index",
      "--",
      ...paths,
    ]);
    expect(result.stdout.trim().split(/\r?\n/)).toEqual(paths);
  });

  it("ignores private and generated files while keeping portable assets trackable", async () => {
    await bootstrapRuntimePaths(config);
    await execFileAsync("git", ["init", "--quiet", config.paths.workspaceDir]);
    const excludes = join(directory, "empty-excludes");
    await writeFile(excludes, "");
    const ignored = [
      ".cc/data/cc.db",
      ".cc/opencode-v2/data/auth.json",
      "auth/owner.json",
      "database/cc.db",
      "sessions/chat.json",
      ".cc-migrations/state.json",
      "tmp/upload.txt",
      "update-history.json",
      "configuration/secrets.json",
      "Documents/private.md",
      "specialists/test/Documents/private.md",
      "specialists/test/memory/notes.md",
      "specialists/test/conversation_log/run.md",
      "specialists/test/playground/project/main.ts",
      "specialists/.archived/old/playground/test.md",
      "specialists/test/nested/playground/file.md",
      "specialists/.archived/old/memory/private.md",
      "specialists/test/.opencode/cc-tools/tool.ts",
      "specialists/.archived/old/.opencode/cc-tools/tool.ts",
      "specialists/test/.playwright-mcp/state.json",
      ".env",
      ".env.local",
      "specialists/test/.env",
      "cert.pem",
      "private.key",
      "cert.p12",
      "cert.pfx",
      "project/node_modules/pkg/index.js",
      "project/.venv/bin/python",
      "project/venv/bin/python",
      "project/__pycache__/file.pyc",
      "project/.cache/state",
      "project/dist/index.js",
      "project/build/output",
      "project/.next/cache",
      "project/coverage/report",
      "project/playwright-report/index.html",
      "project/test-results/run.json",
      "server.log",
      "server.log.1",
      "project/.DS_Store",
      "project/Thumbs.db",
    ];
    const trackable = [
      "opencode.jsonc",
      "specialists/test/opencode.jsonc",
      "specialists/.archived/old/opencode.jsonc",

      ".gitignore",
      ".env.example",
      "specialists/test/.env.example",
      "configuration/task-templates/id/task.json",
      "configuration/task-templates/id/task.md",
      "configuration/task-templates/id/context/notes.md",
      "configuration/preferences/settings.json",
      "skills/example/SKILL.md",
      "custom-tools/example/tool.ts",
      "specialists/test/AGENTS.md",
      "specialists/test/specialist.json",
      "specialists/test/.opencode/skills/local/SKILL.md",
      "specialists/test/.opencode/tools/local.ts",
      "specialists/.archived/old/.opencode/skills/local/SKILL.md",
      "specialists/.archived/old/.opencode/tools/local.ts",
      "README.md",
    ];
    const result = await execFileAsync("git", [
      "-c",
      `core.excludesFile=${excludes}`,
      "-C",
      config.paths.workspaceDir,
      "check-ignore",
      "--no-index",
      "--",
      ...ignored,
      ...trackable,
    ]);
    expect(result.stdout.trim().split(/\r?\n/)).toEqual(ignored);
  });
});
