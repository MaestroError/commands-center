import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";

const {
  createLoggerMock,
  createOwnerAccessServiceMock,
  createSystemVersionServiceMock,
  bootstrapWorkspaceRootMock,
  chmodSyncMock,
  existsSyncMock,
  loadEnvFileMock,
  loadRuntimeConfigMock,
  mkdirSyncMock,
  readFileSyncMock,
  readPackageInfoMock,
  rollbackLatestWorkspaceMigrationMock,
  rollbackMock,
  runClaimCodeCommandMock,
  runWorkspaceMigrationsMock,
  startServerRuntimeMock,
  updateMock,
  writeFileSyncMock,
} = vi.hoisted(() => ({
  bootstrapWorkspaceRootMock: vi.fn(),
  chmodSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  loadEnvFileMock: vi.fn(),
  startServerRuntimeMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  readPackageInfoMock: vi.fn(),
  loadRuntimeConfigMock: vi.fn(),
  createLoggerMock: vi.fn(),
  createOwnerAccessServiceMock: vi.fn(),
  createSystemVersionServiceMock: vi.fn(),
  updateMock: vi.fn(),
  rollbackMock: vi.fn(),
  rollbackLatestWorkspaceMigrationMock: vi.fn(),
  runClaimCodeCommandMock: vi.fn(),
  runWorkspaceMigrationsMock: vi.fn(),
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

vi.mock("@cc/backend", () => ({
  bootstrapWorkspaceRoot: bootstrapWorkspaceRootMock,
  createLogger: createLoggerMock,
  createOwnerAccessService: createOwnerAccessServiceMock,
  createSystemVersionService: createSystemVersionServiceMock,
  loadEnvFile: loadEnvFileMock,
  loadRuntimeConfig: loadRuntimeConfigMock,
  readPackageInfo: readPackageInfoMock,
  rollbackLatestWorkspaceMigration: rollbackLatestWorkspaceMigrationMock,
  runClaimCodeCommand: runClaimCodeCommandMock,
  runWorkspaceMigrations: runWorkspaceMigrationsMock,
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
      "CC_HOST=0.0.0.0\nCC_PORT=3000\nCC_WORKSPACE_DIR=.cc/workspace\nCC_DATA_DIR=.cc/data\nCC_SECRET_KEY=\n",
    );
    readPackageInfoMock.mockReturnValue({
      version: "0.1.0",
      packageRoot: "/tmp/commandscenter",
    });
    loadRuntimeConfigMock.mockReturnValue({ workspaceRoot: "/tmp/workspace" });
    createLoggerMock.mockReturnValue({ info: vi.fn() });
    createOwnerAccessServiceMock.mockReturnValue({ stateFile: "/tmp/workspace/auth/owner.json" });
    runClaimCodeCommandMock.mockResolvedValue([
      "CLAIM code: claim-code",
      "temporary owner recovery power",
    ]);
    bootstrapWorkspaceRootMock.mockResolvedValue(undefined);
    runWorkspaceMigrationsMock.mockResolvedValue({ applied: [] });
    rollbackLatestWorkspaceMigrationMock.mockResolvedValue({});
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

    await runCli(["start", "--cc-env-file", "/tmp/.env", "--version"]);

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
      expect.stringContaining("CC_DATA_DIR=/home/test/.cc/data"),
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
    expect(process.env["CC_SECRET_KEY"]).toMatch(/^[a-f0-9]{64}$/);
    expect(loadEnvFileMock).toHaveBeenCalledWith("/home/test/.cc/.env");
  });

  it("makes the generated first-run secret key available before runtime startup", async () => {
    existsSyncMock.mockImplementation((path: string) => path.endsWith(".env.prod.example"));

    await runCli(["serve"]);

    expect(startServerRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          CC_SECRET_KEY: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
  });

  it("persists other CC_* environment values into the generated env file", async () => {
    existsSyncMock.mockImplementation((path: string) => path.endsWith(".env.prod.example"));
    readFileSyncMock.mockReturnValue(
      "CC_HOST=0.0.0.0\nCC_PORT=3000\nCC_WORKSPACE_DIR=.cc/workspace\nCC_DATA_DIR=.cc/data\nCC_SECRET_KEY=\nCC_PUBLIC_ORIGIN=\nCC_LOG_LEVEL=info\n",
    );
    process.env["CC_PUBLIC_ORIGIN"] = "https://cc.example.com";
    process.env["CC_LOG_LEVEL"] = "debug";

    await runCli(["start"]);

    expect(writeFileSyncMock).toHaveBeenCalledWith(
      "/home/test/.cc/.env",
      expect.stringContaining("CC_PUBLIC_ORIGIN=https://cc.example.com"),
      { encoding: "utf8", mode: 0o600 },
    );
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      "/home/test/.cc/.env",
      expect.stringContaining("CC_LOG_LEVEL=debug"),
      { encoding: "utf8", mode: 0o600 },
    );
  });

  it("does not persist CC_* keys absent from the template or internal run markers", async () => {
    existsSyncMock.mockImplementation((path: string) => path.endsWith(".env.prod.example"));
    readFileSyncMock.mockReturnValue(
      "CC_HOST=0.0.0.0\nCC_PORT=3000\nCC_WORKSPACE_DIR=.cc/workspace\nCC_DATA_DIR=.cc/data\nCC_SECRET_KEY=\nCC_PUBLIC_ORIGIN=\n",
    );
    // Not present in the template -> must be ignored, not appended.
    process.env["CC_TOTALLY_UNKNOWN"] = "should-not-be-written";

    await runCli(["start"]);

    const writtenContent = writeFileSyncMock.mock.calls.find(
      (call) => call[0] === "/home/test/.cc/.env",
    )?.[1] as string;

    expect(writtenContent).not.toContain("CC_TOTALLY_UNKNOWN");
    expect(writtenContent).not.toContain("CC_FIRST_RUN_ENV_FILE_CREATED");
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
      "--cc-env-file",
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
      expect.stringContaining("CC_DATA_DIR=/opt/commandscenter/data"),
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

  it("generates a claim code without starting the server", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    existsSyncMock.mockImplementation((path: string) => path === "/home/test/.cc/.env");

    await runCli(["claim"]);

    expect(loadEnvFileMock).toHaveBeenCalledWith("/home/test/.cc/.env");
    expect(createOwnerAccessServiceMock).toHaveBeenCalled();
    expect(runClaimCodeCommandMock).toHaveBeenCalledWith({
      config: { workspaceRoot: "/tmp/workspace" },
      ownerAccessService: { stateFile: "/tmp/workspace/auth/owner.json" },
      yes: false,
      format: "text",
    });
    expect(startServerRuntimeMock).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenNthCalledWith(1, "CLAIM code: claim-code");
    expect(consoleLog).toHaveBeenNthCalledWith(2, "temporary owner recovery power");
  });

  it("supports claim-code as an alias", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    existsSyncMock.mockImplementation((path: string) => path === "/home/test/.cc/.env");

    await runCli(["claim-code"]);

    expect(loadEnvFileMock).toHaveBeenCalledWith("/home/test/.cc/.env");
    expect(runClaimCodeCommandMock).toHaveBeenCalled();
    expect(startServerRuntimeMock).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenNthCalledWith(1, "CLAIM code: claim-code");
  });

  it("prints claim codes as json when requested", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    existsSyncMock.mockImplementation((path: string) => path === "/home/test/.cc/.env");
    runClaimCodeCommandMock.mockResolvedValue([
      JSON.stringify({
        purpose: "claim",
        code: "claim-code",
        warning: "temporary owner recovery power",
      }),
    ]);

    await runCli(["claim", "--format", "json"]);

    expect(consoleLog).toHaveBeenCalledWith(
      JSON.stringify({
        purpose: "claim",
        code: "claim-code",
        warning: "temporary owner recovery power",
      }),
    );
  });

  it("requires the default env file before generating a claim code", async () => {
    await expect(runCli(["claim"])).rejects.toThrow(
      "No CommandsCenter env file found at /home/test/.cc/.env. Start CommandsCenter first with ccenter start, or pass --cc-env-file to an existing env file.",
    );

    expect(writeFileSyncMock).not.toHaveBeenCalled();
    expect(loadRuntimeConfigMock).not.toHaveBeenCalled();
    expect(runClaimCodeCommandMock).not.toHaveBeenCalled();
  });

  it("requires an explicit env file before generating a claim code", async () => {
    await expect(runCli(["claim", "--cc-env-file", "/opt/commandscenter/.env"])).rejects.toThrow(
      'Env file not found: /opt/commandscenter/.env. Start CommandsCenter first with ccenter start --cc-env-file "/opt/commandscenter/.env", or pass an existing env file.',
    );

    expect(writeFileSyncMock).not.toHaveBeenCalled();
    expect(loadEnvFileMock).not.toHaveBeenCalled();
    expect(runClaimCodeCommandMock).not.toHaveBeenCalled();
  });

  it("runs pending workspace filesystem migrations", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    existsSyncMock.mockImplementation((path: string) => path === "/home/test/.cc/.env");
    runWorkspaceMigrationsMock.mockResolvedValue({
      applied: [
        {
          id: "0001-example",
          description: "Example",
          appliedAt: "2026-06-14T00:00:00.000Z",
        },
      ],
    });

    await runCli(["filesystem-migrate"]);

    expect(loadEnvFileMock).toHaveBeenCalledWith("/home/test/.cc/.env");
    expect(bootstrapWorkspaceRootMock).toHaveBeenCalledWith({ workspaceRoot: "/tmp/workspace" });
    expect(runWorkspaceMigrationsMock).toHaveBeenCalledWith({
      config: { workspaceRoot: "/tmp/workspace" },
      logger: { info: expect.any(Function) },
    });
    expect(consoleLog).toHaveBeenCalledWith("Applied workspace filesystem migration: 0001-example");
    expect(startServerRuntimeMock).not.toHaveBeenCalled();
  });

  it("prints when there are no pending workspace filesystem migrations", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    existsSyncMock.mockImplementation((path: string) => path === "/home/test/.cc/.env");

    await runCli(["filesystem-migrate"]);

    expect(consoleLog).toHaveBeenCalledWith("No pending workspace filesystem migrations.");
    expect(startServerRuntimeMock).not.toHaveBeenCalled();
  });

  it("rolls back the latest workspace filesystem migration", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    existsSyncMock.mockImplementation((path: string) => path === "/home/test/.cc/.env");
    rollbackLatestWorkspaceMigrationMock.mockResolvedValue({
      rolledBack: {
        id: "0001-example",
        description: "Example",
        appliedAt: "2026-06-14T00:00:00.000Z",
      },
    });

    await runCli(["filesystem-rollback"]);

    expect(loadEnvFileMock).toHaveBeenCalledWith("/home/test/.cc/.env");
    expect(bootstrapWorkspaceRootMock).toHaveBeenCalledWith({ workspaceRoot: "/tmp/workspace" });
    expect(rollbackLatestWorkspaceMigrationMock).toHaveBeenCalledWith({
      config: { workspaceRoot: "/tmp/workspace" },
      logger: { info: expect.any(Function) },
    });
    expect(consoleLog).toHaveBeenCalledWith(
      "Rolled back workspace filesystem migration: 0001-example",
    );
    expect(startServerRuntimeMock).not.toHaveBeenCalled();
  });

  it("prints when there are no applied workspace filesystem migrations to roll back", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    existsSyncMock.mockImplementation((path: string) => path === "/home/test/.cc/.env");

    await runCli(["filesystem-rollback"]);

    expect(consoleLog).toHaveBeenCalledWith(
      "No applied workspace filesystem migrations to roll back.",
    );
    expect(startServerRuntimeMock).not.toHaveBeenCalled();
  });

  it("requires the default env file before filesystem migration commands", async () => {
    await expect(runCli(["filesystem-migrate"])).rejects.toThrow(
      "No CommandsCenter env file found at /home/test/.cc/.env. Start CommandsCenter first with ccenter start, or pass --cc-env-file to an existing env file.",
    );
    await expect(runCli(["filesystem-rollback"])).rejects.toThrow(
      "No CommandsCenter env file found at /home/test/.cc/.env. Start CommandsCenter first with ccenter start, or pass --cc-env-file to an existing env file.",
    );

    expect(writeFileSyncMock).not.toHaveBeenCalled();
    expect(runWorkspaceMigrationsMock).not.toHaveBeenCalled();
    expect(rollbackLatestWorkspaceMigrationMock).not.toHaveBeenCalled();
  });

  it("explains reclaim codes do not invalidate the current password immediately", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    existsSyncMock.mockImplementation((path: string) => path === "/home/test/.cc/.env");
    runClaimCodeCommandMock.mockResolvedValue([
      "RECLAIM code: reclaim-code",
      "temporary owner recovery power",
      "The current owner password remains valid until reclaim completes.",
    ]);

    await runCli(["claim", "--yes"]);

    expect(consoleLog).toHaveBeenNthCalledWith(1, "RECLAIM code: reclaim-code");
    expect(consoleLog).toHaveBeenNthCalledWith(2, "temporary owner recovery power");
    expect(consoleLog).toHaveBeenNthCalledWith(
      3,
      "The current owner password remains valid until reclaim completes.",
    );
  });

  it("prints cancellation returned by claim command flow", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    existsSyncMock.mockImplementation((path: string) => path === "/home/test/.cc/.env");
    runClaimCodeCommandMock.mockResolvedValue(["Claim-code generation cancelled."]);

    await runCli(["claim"]);

    expect(consoleLog).toHaveBeenCalledWith("Claim-code generation cancelled.");
  });

  it("passes --yes to the claim command flow", async () => {
    existsSyncMock.mockImplementation((path: string) => path === "/home/test/.cc/.env");

    await runCli(["claim", "--yes"]);

    expect(runClaimCodeCommandMock).toHaveBeenCalledWith(expect.objectContaining({ yes: true }));
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
