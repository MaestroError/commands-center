import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import Fastify from "fastify";
import pino from "pino";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TerminalSession } from "@cc/shared/schemas";
import { configureFastifyZod, type AppServer } from "../../src/lib/fastify-zod.js";
import { loadRuntimeConfig } from "../../src/lib/runtime-config.js";
import { registerTerminalRoutes } from "../../src/routes/terminal.js";

describe.skipIf(process.platform === "win32")("local terminal routes", () => {
  let directory: string;
  let server: AppServer;
  let origin: string;
  const sockets: WebSocket[] = [];
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "cc-terminal-route-"));
    const config = loadRuntimeConfig({ cwd: directory, env: { NODE_ENV: "test" } });
    await mkdir(config.paths.workspaceDir, { recursive: true });
    server = Fastify();
    configureFastifyZod(server);
    registerTerminalRoutes(server, { config, logger: pino({ level: "silent" }) });
    origin = await server.listen({ host: "127.0.0.1", port: 0 });
  });
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.terminate();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  async function create(): Promise<TerminalSession> {
    const response = await server.inject({
      method: "POST",
      url: "/api/terminal",
      payload: { shell: "/bin/sh" },
    });
    expect(response.statusCode).toBe(201);
    return response.json<TerminalSession>();
  }
  async function connect(id: string) {
    const socket = new WebSocket(`${origin.replace("http:", "ws:")}/api/terminal/${id}/connect`);
    sockets.push(socket);
    let output = "";
    socket.on("message", (data) => {
      output += (
        Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data)
      ).toString("utf8");
    });
    await once(socket, "open");
    return { socket, output: () => output };
  }
  it("creates a local session without an OpenCode daemon", async () => {
    expect((await create()).backend).toBe("local");
  });
  it("lists created sessions", async () => {
    const session = await create();
    const response = await server.inject({ method: "GET", url: "/api/terminal" });
    expect(response.json()).toEqual({ sessions: [session] });
  });
  it("gets a session by id", async () => {
    const session = await create();
    const response = await server.inject({ method: "GET", url: `/api/terminal/${session.id}` });
    expect(response.json()).toEqual(session);
  });
  it("returns 404 for an unknown session", async () => {
    expect((await server.inject({ method: "GET", url: "/api/terminal/missing" })).statusCode).toBe(
      404,
    );
  });
  it.each([0, 201])("rejects invalid resize columns %s", async (cols) => {
    const session = await create();
    const response = await server.inject({
      method: "POST",
      url: `/api/terminal/${session.id}/resize`,
      payload: { cols, rows: 24 },
    });
    expect(response.statusCode).toBe(400);
  });
  it("streams shell output over the browser WebSocket protocol", async () => {
    const session = await create();
    const { socket, output } = await connect(session.id);
    socket.send("printf 'WS_%s' 'OUTPUT'\r");
    await expect.poll(output).toContain("WS_OUTPUT");
  });
  it("applies HTTP resize to the connected shell", async () => {
    const session = await create();
    const { socket, output } = await connect(session.id);
    await server.inject({
      method: "POST",
      url: `/api/terminal/${session.id}/resize`,
      payload: { cols: 93, rows: 37 },
    });
    socket.send("stty size\r");
    await expect.poll(output).toContain("37 93");
  });
  it("replays prior output after a WebSocket reconnect", async () => {
    const session = await create();
    const first = await connect(session.id);
    first.socket.send("printf 'WS_%s' 'REPLAY'\r");
    await expect.poll(first.output).toContain("WS_REPLAY");
    const closed = once(first.socket, "close");
    first.socket.close();
    await closed;
    const next = await connect(session.id);
    await expect.poll(next.output).toContain("WS_REPLAY");
  });
  it("closes the socket when the shell exits", async () => {
    const session = await create();
    const { socket } = await connect(session.id);
    const closed = once(socket, "close");
    socket.send("exit\r");
    await closed;
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });
  it("deletes the session", async () => {
    const session = await create();
    const response = await server.inject({ method: "DELETE", url: `/api/terminal/${session.id}` });
    expect(response.statusCode).toBe(204);
  });
  it("shuts down with a connected terminal", async () => {
    const session = await create();
    const { socket } = await connect(session.id);
    const closed = once(socket, "close");
    await server.close();
    await closed;
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });
});
