import { afterEach, describe, expect, it, vi } from "vitest";

import { createOpenCodePtyBackend } from "../../../src/services/terminal/opencode-pty-backend";
import type { RuntimeConfig } from "../../../src/lib/runtime-config";

const config = { opencode: { baseUrl: "http://opencode.test" } } as unknown as RuntimeConfig;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

afterEach(() => {
  vi.unstubAllGlobals();
});

function json(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function backend() {
  return createOpenCodePtyBackend({ config, logger });
}

describe("opencode pty backend", () => {
  it("creates a session and throws on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { id: "pty-1", cwd: "/work" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = await backend().create({ cwd: "/work", shell: "/bin/zsh" });
    expect(session).toMatchObject({ id: "pty-1", backend: "opencode", cwd: "/work" });

    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(backend().create({})).rejects.toThrow("Failed to create PTY session");
  });

  it("lists sessions and returns an empty list on failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, [{ id: "a", cwd: "/x" }, { id: "b" }]));
    vi.stubGlobal("fetch", fetchMock);
    const list = await backend().list();
    expect(list.map((s) => s.id)).toEqual(["a", "b"]);

    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 500 }));
    expect(await backend().list()).toEqual([]);
  });

  it("resizes a session and throws on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(backend().resize("pty-1", 80, 24)).resolves.toBeUndefined();

    fetchMock.mockResolvedValue(new Response("err", { status: 500 }));
    await expect(backend().resize("pty-1", 80, 24)).rejects.toThrow("Failed to resize");
  });

  it("closes a session, tolerating a 404 but throwing on other errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(backend().close("pty-1")).resolves.toBeUndefined();

    fetchMock.mockResolvedValue(new Response("gone", { status: 404 }));
    await expect(backend().close("pty-1")).resolves.toBeUndefined();

    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    await expect(backend().close("pty-1")).rejects.toThrow("Failed to close");
  });

  it("reports availability based on the injected predicate", () => {
    expect(createOpenCodePtyBackend({ config, logger }).isAvailable()).toBe(true);
    expect(
      createOpenCodePtyBackend({ config, logger, isAvailable: () => false }).isAvailable(),
    ).toBe(false);
  });

  it("attaches to a created session over a WebSocket and wires the handle", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { id: "pty-1", cwd: "/work" }));
    vi.stubGlobal("fetch", fetchMock);

    class FakeWebSocket {
      static OPEN = 1;
      readyState = 1;
      onopen: (() => void) | null = null;
      onerror: ((err: unknown) => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: ((event: { code: number }) => void) | null = null;
      sent: string[] = [];
      constructor() {
        queueMicrotask(() => this.onopen?.());
      }
      send(data: string) {
        this.sent.push(data);
      }
      close() {
        this.onclose?.({ code: 0 });
      }
    }
    vi.stubGlobal("WebSocket", FakeWebSocket as never);

    const be = backend();
    await be.create({ cwd: "/work" });

    await expect(be.attach("missing")).rejects.toThrow("Session not found");

    const handle = await be.attach("pty-1");
    const received: string[] = [];
    let exitCode: number | undefined;
    handle.onData((data) => received.push(data));
    handle.onExit((code) => {
      exitCode = code;
    });
    handle.write("ls");
    handle.resize(100, 40);
    handle.close();

    expect(exitCode).toBe(0);
  });
});
