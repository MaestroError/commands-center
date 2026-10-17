import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createEmbeddedOpenCodeHost,
  type EmbeddedOpenCodeHost,
} from "../../src/opencode/embedded-host.js";

describe("embedded host native terminals", () => {
  const originalEnv = { ...process.env };
  let workspace: string;
  let host: EmbeddedOpenCodeHost;
  let directory: string;
  const terminals = new Set<string>();
  const openHost = (): Promise<EmbeddedOpenCodeHost> =>
    createEmbeddedOpenCodeHost({
      workspaceDirectory: workspace,
      sdkOptions: { models: { fetch: false }, fs: { filewatcher: false, fff: false } },
    });

  async function createTerminal(script = "setInterval(() => {}, 1000)") {
    const result = await host.pty.create({
      location: { directory },
      command: process.execPath,
      args: ["-e", script],
      cwd: directory,
    });
    terminals.add(result.data.id);
    return result.data;
  }

  beforeAll(async () => {
    workspace = await realpath(await mkdtemp(join(tmpdir(), "cc-embedded-terminal-")));
    directory = join(workspace, "specialist");
    await mkdir(directory);
    await mkdir(join(workspace, "other"));
    process.env["OPENCODE_TEST_HOME"] = workspace;
    host = await openHost();
  }, 30000);

  afterEach(async () => {
    for (const ptyID of terminals) {
      await host.pty.remove({ location: { directory }, ptyID });
    }
    terminals.clear();
  });

  afterAll(async () => {
    await host?.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    if (workspace) await rm(workspace, { recursive: true, force: true });
  });

  it("starts a real terminal in the specialist directory", async () => {
    await createTerminal(`
      require('node:fs').writeFileSync('terminal-cwd', process.cwd());
      setInterval(() => {}, 1000);
    `);
    await expect.poll(() => readFile(join(directory, "terminal-cwd"), "utf8")).toBe(directory);
  });

  it("connects the child process to a native TTY", async () => {
    await createTerminal(`
      require('node:fs').writeFileSync('terminal-tty', String(process.stdout.isTTY));
      setInterval(() => {}, 1000);
    `);
    await expect.poll(() => readFile(join(directory, "terminal-tty"), "utf8")).toBe("true");
  });

  it("isolates terminal inventory by location", async () => {
    await createTerminal();
    const result = await host.pty.list({ location: { directory: join(workspace, "other") } });
    expect(result.data).toEqual([]);
  });

  it("resizes the actual child terminal", async () => {
    const terminal = await createTerminal(`
      const fs = require('node:fs');
      const report = () => fs.writeFileSync('terminal-size', process.stdout.columns + 'x' + process.stdout.rows);
      process.stdout.on('resize', report);
      report();
      setInterval(() => {}, 1000);
    `);
    await expect
      .poll(() => readFile(join(directory, "terminal-size"), "utf8"))
      .toMatch(/^\d+x\d+$/);
    await host.pty.update({
      location: { directory },
      ptyID: terminal.id,
      size: { cols: 93, rows: 37 },
    });
    await expect.poll(() => readFile(join(directory, "terminal-size"), "utf8")).toBe("93x37");
  });

  it("reports the child process exit code", async () => {
    const terminal = await createTerminal("setTimeout(() => process.exit(7), 100)");
    await expect
      .poll(async () => (await host.pty.get({ location: { directory }, ptyID: terminal.id })).data)
      .toMatchObject({ status: "exited", exitCode: 7 });
  });

  it("terminates the child when its terminal is removed", async () => {
    const terminal = await createTerminal();
    await host.pty.remove({ location: { directory }, ptyID: terminal.id });
    terminals.delete(terminal.id);
    await vi.waitFor(() => {
      expect(() => process.kill(terminal.pid, 0)).toThrowError(
        expect.objectContaining({ code: "ESRCH" }),
      );
    });
  });

  it("terminates active terminals when the embedded host closes", async () => {
    const terminal = await createTerminal();
    await host.close();
    terminals.clear();
    try {
      await vi.waitFor(() => {
        expect(() => process.kill(terminal.pid, 0)).toThrowError(
          expect.objectContaining({ code: "ESRCH" }),
        );
      });
    } finally {
      host = await openHost();
    }
  });
});
