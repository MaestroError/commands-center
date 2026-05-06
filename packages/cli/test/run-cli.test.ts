import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";

const {
  createLoggerMock,
  createSystemVersionServiceMock,
  chmodSyncMock,
  existsSyncMock,
  loadEnvFileMock,
  loadRuntimeConfigMock,
  mkdirSyncMock,
  readFileSyncMock,
  readPackageInfoMock,
  rollbackMock,
  startServerRuntimeMock,
  updateMock,
  writeFileSyncMock,
} = vi.hoisted(() => ({
  chmodSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  loadEnvFileMock: vi.fn(),
  startServerRuntimeMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  readPackageInfoMock: vi.fn(),
  loadRuntimeConfigMock: vi.fn(),
  createLoggerMock: vi.fn(),
  createSystemVersionServiceMock: vi.fn(),
  updateMock: vi.fn(),
  rollbackMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  chmodSync: chmodSyncMock,
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
}));

vi.mock("node:os", () => ({
  homedir: () => "/home/test",
}));

vi.mock("../src/env-file.js", () => ({
  loadEnvFile: loadEnvFileMock,
}));

vi.mock("@cc/backend", () => ({
  createLogger: createLoggerMock,
  createSystemVersionService: createSystemVersionServiceMock,
  loadRuntimeConfig: loadRuntimeConfigMock,
  readPackageInfo: readPackageInfoMock,
  startServerRuntime: startServerRuntimeMock,
}));

import fastifyStatic from "@fastify/static";
import { resolveStaticAssetsDir, runCli } from "../src/cli.js";

type StaticRegisterServer = {
  register: (plugin: unknown, options: unknown) => Promise<void>;
  setNotFoundHandler: (handler: (request: FastifyRequest, reply: FastifyReply) => unknown) => void;
};

type StartServerRuntimeCall = {
  register?: (server: StaticRegisterServer) => Promise<void>;
};

describe("runCli", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.exitCode = undefined;
    existsSyncMock.mockReturnValue(false);
    readFileSyncMock.mockReturnValue(
      "CC_HOST=0.0.0.0\nCC_PORT=3000\nCC_WORKSPACE_DIR=.cc/workspace\nCC_SECRET_KEY=\n",
    );
    readPackageInfoMock.mockReturnValue({
      version: "0.1.0",
      packageRoot: "/tmp/commandscenter",
    });
    loadRuntimeConfigMock.mockReturnValue({ workspaceRoot: "/tmp/workspace" });
    createLoggerMock.mockReturnValue({ info: vi.fn() });
    updateMock.mockResolvedValue({ message: "Updated", instructions: ["Restart shell"] });
    rollbackMock.mockResolvedValue({ message: "Rolled back", instructions: ["Retry publish"] });
    createSystemVersionServiceMock.mockReturnValue({
      update: updateMock,
      rollback: rollbackMock,
    });
    startServerRuntimeMock.mockResolvedValue(undefined);
  });

  it("prints version without loading env or starting the server", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["start", "--env-file", "/tmp/.env", "--version"]);

    expect(loadEnvFileMock).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalledWith("0.1.0");
    expect(startServerRuntimeMock).not.toHaveBeenCalled();
  });

  it("prints help without loading env or starting the server", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["start", "--help"]);

    expect(loadEnvFileMock).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalled();
    expect(startServerRuntimeMock).not.toHaveBeenCalled();
  });

  it("loads the default user env file when one exists", async () => {
    existsSyncMock.mockImplementation((path: string) => path === "/home/test/.cc/.env");

    await runCli(["serve"]);

    expect(loadEnvFileMock).toHaveBeenCalledWith("/home/test/.cc/.env");
    expect(startServerRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: { host: undefined, port: undefined },
        register: undefined,
      }),
    );
  });

  it("creates the default user env file on first start", async () => {
    existsSyncMock.mockImplementation((path: string) => path.endsWith(".env.prod.example"));

    await runCli(["start"]);

    expect(mkdirSyncMock).toHaveBeenCalledWith("/home/test/.cc", { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      "/home/test/.cc/.env",
      expect.stringContaining("CC_WORKSPACE_DIR=/home/test/.cc/workspace"),
      { encoding: "utf8", mode: 0o600 },
    );
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      "/home/test/.cc/.env",
      expect.stringMatching(/CC_SECRET_KEY=[a-f0-9]{64}/),
      { encoding: "utf8", mode: 0o600 },
    );
    expect(chmodSyncMock).toHaveBeenCalledWith("/home/test/.cc/.env", 0o600);
    expect(process.env["CC_FIRST_RUN_ENV_FILE_CREATED"]).toBe("true");
    expect(process.env["CC_FIRST_RUN_ENV_FILE_PATH"]).toBe("/home/test/.cc/.env");
    expect(loadEnvFileMock).toHaveBeenCalledWith("/home/test/.cc/.env");
  });

  it("creates an explicit missing env file before start and prints a warning", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    existsSyncMock.mockImplementation((path: string) => path.endsWith(".env.prod.example"));
    process.env["CC_WORKSPACE_DIR"] = "/srv/cc/workspace";

    await runCli([
      "start",
      "--host",
      "127.0.0.1",
      "--port",
      "4010",
      "--env-file",
      "/opt/commandscenter/.env",
    ]);

    expect(consoleWarn).toHaveBeenCalledWith(
      "\u001b[33mWarning: /opt/commandscenter/.env does not exist. Creating it from .env.prod.example before starting CommandsCenter.\u001b[0m",
    );
    expect(mkdirSyncMock).toHaveBeenCalledWith("/opt/commandscenter", { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      "/opt/commandscenter/.env",
      expect.stringContaining("CC_WORKSPACE_DIR=/srv/cc/workspace"),
      { encoding: "utf8", mode: 0o600 },
    );
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      "/opt/commandscenter/.env",
      expect.stringContaining("CC_HOST=127.0.0.1"),
      { encoding: "utf8", mode: 0o600 },
    );
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      "/opt/commandscenter/.env",
      expect.stringContaining("CC_PORT=4010"),
      { encoding: "utf8", mode: 0o600 },
    );
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      "/opt/commandscenter/.env",
      expect.stringMatching(/CC_SECRET_KEY=[a-f0-9]{64}/),
      { encoding: "utf8", mode: 0o600 },
    );
    expect(chmodSyncMock).toHaveBeenCalledWith("/opt/commandscenter/.env", 0o600);
    expect(process.env["CC_FIRST_RUN_ENV_FILE_CREATED"]).toBe("true");
    expect(process.env["CC_FIRST_RUN_ENV_FILE_PATH"]).toBe("/opt/commandscenter/.env");
    expect(loadEnvFileMock).toHaveBeenCalledWith("/opt/commandscenter/.env");
  });

  it("reports unknown commands without mutating workspace settings", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.env["INIT_CWD"] = "/workspace";

    await runCli(["unknown"]);

    expect(process.env["CC_WORKSPACE_DIR"]).toBeUndefined();
    expect(process.exitCode).toBe(1);
    expect(consoleError).toHaveBeenCalledWith("Unknown command: unknown");
    expect(consoleLog).toHaveBeenCalled();
    expect(startServerRuntimeMock).not.toHaveBeenCalled();
  });

  it("starts the runtime in serve mode with host and port overrides", async () => {
    delete process.env["NODE_ENV"];
    process.env["INIT_CWD"] = "/workspace";

    existsSyncMock.mockImplementation((path: string) => path === "/home/test/.cc/.env");

    await runCli(["serve", "--host", "127.0.0.1", "--port", "4010"]);

    expect(startServerRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: { host: "127.0.0.1", port: 4010 },
        env: process.env,
        register: undefined,
      }),
    );
    expect(process.env["NODE_ENV"]).toBe("production");
  });

  it("registers static assets and the SPA fallback in start mode", async () => {
    existsSyncMock.mockImplementation(
      (path: string) => path === "/home/test/.cc/.env" || path.endsWith("/public"),
    );

    await runCli(["start"]);

    const options = startServerRuntimeMock.mock.calls[0]?.[0] as StartServerRuntimeCall | undefined;
    expect(options?.register).toBeTypeOf("function");
    if (!options?.register) {
      throw new Error("Expected start command to register static assets.");
    }

    const register = vi.fn().mockResolvedValue(undefined);
    const sendFile = vi.fn();
    let notFoundHandler: ((request: FastifyRequest, reply: FastifyReply) => unknown) | undefined;

    await options.register({
      register,
      setNotFoundHandler: (handler: (request: FastifyRequest, reply: FastifyReply) => unknown) => {
        notFoundHandler = handler;
      },
    });

    expect(register).toHaveBeenCalledWith(
      fastifyStatic,
      expect.objectContaining({ wildcard: false, root: expect.stringMatching(/public$/) }),
    );
    expect(notFoundHandler).toBeTypeOf("function");

    notFoundHandler?.({} as FastifyRequest, { sendFile } as unknown as FastifyReply);
    expect(sendFile).toHaveBeenCalledWith("index.html");
  });

  it("skips static registration when the public directory is absent", async () => {
    existsSyncMock.mockImplementation((path: string) => path === "/home/test/.cc/.env");

    await runCli(["start"]);

    const options = startServerRuntimeMock.mock.calls[0]?.[0] as StartServerRuntimeCall | undefined;
    if (!options?.register) {
      throw new Error("Expected start command to provide a register callback.");
    }
    const register = vi.fn().mockResolvedValue(undefined);
    const setNotFoundHandler = vi.fn();

    await options.register({
      register,
      setNotFoundHandler,
    });

    expect(register).not.toHaveBeenCalled();
    expect(setNotFoundHandler).not.toHaveBeenCalled();
  });

  it("runs upgrade and prints returned instructions", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["upgrade", "--rollback"]);

    expect(createSystemVersionServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { workspaceRoot: "/tmp/workspace" },
        packageRoot: "/tmp/commandscenter",
      }),
    );
    expect(rollbackMock).toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenNthCalledWith(1, "Rolled back");
    expect(consoleLog).toHaveBeenNthCalledWith(2, "Retry publish");
  });

  it("runs upgrade without rollback and prints update instructions", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["upgrade"]);

    expect(updateMock).toHaveBeenCalled();
    expect(rollbackMock).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenNthCalledWith(1, "Updated");
    expect(consoleLog).toHaveBeenNthCalledWith(2, "Restart shell");
  });

  it("fails when the production env template cannot be found", async () => {
    existsSyncMock.mockReturnValue(false);

    await expect(runCli(["start"])).rejects.toThrow(
      "Unable to find .env.prod.example for first-run configuration generation.",
    );

    expect(writeFileSyncMock).not.toHaveBeenCalled();
    expect(loadEnvFileMock).not.toHaveBeenCalled();
    expect(startServerRuntimeMock).not.toHaveBeenCalled();
  });
});

describe("resolveStaticAssetsDir", () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
  });

  it("returns the public directory when present", () => {
    existsSyncMock.mockReturnValue(true);

    expect(resolveStaticAssetsDir()).toMatch(/public$/);
  });

  it("returns undefined when the public directory is missing", () => {
    existsSyncMock.mockReturnValue(false);

    expect(resolveStaticAssetsDir()).toBeUndefined();
  });
});
