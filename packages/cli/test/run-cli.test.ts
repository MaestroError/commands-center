import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";

const {
  createLoggerMock,
  createSystemVersionServiceMock,
  existsSyncMock,
  loadEnvFileMock,
  loadRuntimeConfigMock,
  readPackageInfoMock,
  rollbackMock,
  startServerRuntimeMock,
  updateMock,
} = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  loadEnvFileMock: vi.fn(),
  startServerRuntimeMock: vi.fn(),
  readPackageInfoMock: vi.fn(),
  loadRuntimeConfigMock: vi.fn(),
  createLoggerMock: vi.fn(),
  createSystemVersionServiceMock: vi.fn(),
  updateMock: vi.fn(),
  rollbackMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
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
import { resolve } from "node:path";
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

  it("loads the explicit env file and prints version without starting the server", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["start", "--env-file", "/tmp/.env", "--version"]);

    expect(loadEnvFileMock).toHaveBeenCalledWith("/tmp/.env");
    expect(consoleLog).toHaveBeenCalledWith("0.1.0");
    expect(startServerRuntimeMock).not.toHaveBeenCalled();
  });

  it("loads the default env file when one exists in INIT_CWD", async () => {
    process.env.INIT_CWD = "/workspace";
    existsSyncMock.mockImplementation((path: string) => path === "/workspace/.env");

    await runCli(["serve"]);

    expect(loadEnvFileMock).toHaveBeenCalledWith("/workspace/.env");
    expect(startServerRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: { host: undefined, port: undefined },
        register: undefined,
      }),
    );
  });

  it("reports unknown commands without mutating workspace settings", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.env.INIT_CWD = "/workspace";

    await runCli(["unknown", "--here"]);

    expect(process.env.CC_WORKSPACE_DIR).toBeUndefined();
    expect(process.exitCode).toBe(1);
    expect(consoleError).toHaveBeenCalledWith("Unknown command: unknown");
    expect(consoleLog).toHaveBeenCalled();
    expect(startServerRuntimeMock).not.toHaveBeenCalled();
  });

  it("starts the runtime in serve mode with host and port overrides", async () => {
    delete process.env.NODE_ENV;
    process.env.INIT_CWD = "/workspace";

    await runCli(["serve", "--host", "127.0.0.1", "--port", "4010", "--here"]);

    expect(startServerRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: { host: "127.0.0.1", port: 4010 },
        env: process.env,
        register: undefined,
      }),
    );
    expect(process.env.CC_WORKSPACE_DIR).toBe(resolve("/workspace", ".cc", "workspace"));
    expect(process.env.NODE_ENV).toBe("production");
  });

  it("registers static assets and the SPA fallback in start mode", async () => {
    existsSyncMock.mockImplementation((path: string) => path.endsWith("/public"));

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
    existsSyncMock.mockReturnValue(false);

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
