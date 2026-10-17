import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNodePtyBackend,
  type NodePtyBackend,
} from "../../../src/services/terminal/node-pty-backend.js";

describe.skipIf(process.platform === "win32")("local terminal backend", () => {
  let directory: string;
  let backend: NodePtyBackend;
  beforeEach(async () => {
    directory = await realpath(await mkdtemp(join(tmpdir(), "cc-local-pty-")));
    backend = createNodePtyBackend({
      workspaceDirectory: directory,
      logger: pino({ level: "silent" }),
    });
  });
  afterEach(async () => {
    await backend.dispose();
    await rm(directory, { recursive: true, force: true });
  });

  async function open() {
    const session = await backend.create({ shell: "/bin/sh" });
    const handle = await backend.attach(session.id);
    let output = "";
    handle.onData((data) => {
      output += data;
    });
    handle.write("stty -echo\r");
    return { session, handle, output: () => output };
  }

  it("defaults to the workspace directory", async () => {
    const { session } = await open();
    expect(session.cwd).toBe(directory);
  });
  it("streams actual shell command output", async () => {
    const { handle, output } = await open();
    handle.write("printf 'CC_%s' 'OUTPUT'\r");
    await expect.poll(output).toContain("CC_OUTPUT");
  });
  it("interrupts a foreground process with Ctrl+C while keeping the shell usable", async () => {
    const { handle, output } = await open();
    handle.write("printf 'CC_%s' 'READY'\r");
    await expect.poll(output, { timeout: 5000 }).toContain("CC_READY");
    handle.write("printf 'CC_%s' 'RUNNING'; sleep 30\r");
    await expect.poll(output).toContain("CC_RUNNING");
    handle.write("\x03");
    handle.write("printf 'CC_%s' 'AFTER_INTERRUPT'\r");
    await expect.poll(output, { timeout: 3000 }).toContain("CC_AFTER_INTERRUPT");
  });

  it("resizes the actual terminal", async () => {
    const { session, handle, output } = await open();
    await backend.resize(session.id, 93, 37);
    handle.write("stty size\r");
    await expect.poll(output).toContain("37 93");
  });
  it("keeps the shell alive after detaching", async () => {
    const { session, handle } = await open();
    handle.close();
    expect(await backend.list()).toEqual([session]);
  });
  it("replays output produced while detached", async () => {
    const { session, handle } = await open();
    handle.write("sleep 0.1; printf 'CC_%s' 'REPLAY'; printf ready > replay-ready\r");
    handle.close();
    await expect.poll(() => readFile(join(directory, "replay-ready"), "utf8")).toBe("ready");
    let output = "";
    const next = await backend.attach(session.id);
    next.onData((data) => {
      output += data;
    });
    await expect.poll(() => output).toContain("CC_REPLAY");
  });
  it("preserves shell state across reconnects", async () => {
    const { session, handle } = await open();
    handle.write("CC_MARKER=retained\r");
    handle.close();
    const next = await backend.attach(session.id);
    let output = "";
    next.onData((data) => {
      output += data;
    });
    next.write("printf 'STATE:%s' \"$CC_MARKER\"\r");
    await expect.poll(() => output).toContain("STATE:retained");
  });
  it("reports a natural shell exit", async () => {
    const { handle } = await open();
    let exitCode: number | undefined;
    handle.onExit((code) => {
      exitCode = code;
    });
    handle.write("exit 7\r");
    await expect.poll(() => exitCode).toBe(7);
  });
  it("removes exited terminals from inventory", async () => {
    const { handle } = await open();
    handle.write("exit\r");
    await expect.poll(() => backend.list()).toEqual([]);
  });
  it("terminates a terminal on deletion", async () => {
    const { session, handle } = await open();
    let exited = false;
    handle.onExit(() => {
      exited = true;
    });
    await backend.close(session.id);
    expect(exited).toBe(true);
  });
  it("reaps the shell process on disposal", async () => {
    const { handle } = await open();
    handle.write("echo $$ > shell-pid\r");
    await expect.poll(() => readFile(join(directory, "shell-pid"), "utf8")).toMatch(/^\d+/);
    const pid = Number(await readFile(join(directory, "shell-pid"), "utf8"));
    await backend.dispose();
    await vi.waitFor(() =>
      expect(() => process.kill(pid, 0)).toThrowError(expect.objectContaining({ code: "ESRCH" })),
    );
  });
  it("bounds the replay sent on reconnect", async () => {
    const { session, handle, output } = await open();
    handle.write("head -c 300000 /dev/zero | tr '\\000' x; printf 'BUFFER_%s' 'DONE'\r");
    await expect.poll(output).toContain("BUFFER_DONE");
    handle.close();
    const next = await backend.attach(session.id);
    let replay = "";
    next.onData((data) => {
      replay += data;
    });
    expect(replay.length).toBeLessThanOrEqual(256 * 1024 + 2);
  });
  it("terminates every terminal on disposal", async () => {
    await open();
    await open();
    await backend.dispose();
    expect(await backend.list()).toEqual([]);
  });
  it("rejects creation after disposal", async () => {
    await backend.dispose();
    await expect(backend.create({})).rejects.toThrow("closed");
  });
  it("rejects unknown terminal attachment", async () => {
    await expect(backend.attach("missing")).rejects.toThrow("not found");
  });
  it("cleans up a shell that fails to start", async () => {
    await backend.create({ shell: "/does/not/exist" });
    await expect.poll(() => backend.list()).toEqual([]);
  });
});
