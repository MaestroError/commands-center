import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/lib/logger";
import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import {
  compareVersions,
  createSystemVersionService,
  detectInstallMode,
} from "../../src/services/system-version-service";
import { createTestDatabase } from "../helpers/db";

describe("detectInstallMode", () => {
  it("detects Docker from environment", () => {
    expect(
      detectInstallMode({
        env: { CC_DOCKER: "true" },
        packageRoot: "/app/node_modules/commandscenter",
        dockerEnvPath: "/definitely/missing",
      }),
    ).toBe("docker");
  });

  it("detects npm global when package root is inside the global root", () => {
    expect(
      detectInstallMode({
        env: {},
        packageRoot: "/usr/local/lib/node_modules/commandscenter",
        globalRoot: "/usr/local/lib/node_modules",
        dockerEnvPath: "/definitely/missing",
      }),
    ).toBe("npm-global");
  });

  it("detects npm global from the resolved npm global root", () => {
    expect(
      detectInstallMode({
        env: {},
        packageRoot: "/opt/homebrew/lib/node_modules/commandscenter",
        dockerEnvPath: "/definitely/missing",
        resolveGlobalRoot: () => "/opt/homebrew/lib/node_modules",
      }),
    ).toBe("npm-global");
  });

  it("falls back to npm local", () => {
    expect(
      detectInstallMode({
        env: {},
        packageRoot: "/workspace/node_modules/commandscenter",
        dockerEnvPath: "/definitely/missing",
        resolveGlobalRoot: () => undefined,
      }),
    ).toBe("npm-local");
  });
});

describe("compareVersions", () => {
  it("compares semantic versions", () => {
    expect(compareVersions("1.2.1", "1.2.0")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0", "1.2.1")).toBeLessThan(0);
    expect(compareVersions("1.2.0", "1.2.0")).toBe(0);
  });
});

describe("createSystemVersionService", () => {
  it("checks npm latest version and reports update availability", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-version-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    const service = createSystemVersionService({
      config,
      logger: createLogger(config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: cwd },
      packageRoot: cwd,
      fetchLatest: () => Promise.resolve("1.1.0"),
      detectMode: () => "npm-global",
    });

    try {
      await expect(service.checkNow()).resolves.toMatchObject({
        current: "1.0.0",
        latest: "1.1.0",
        updateAvailable: true,
        installMode: "npm-global",
        autoUpdateEnabled: false,
        autoUpdateSource: "environment",
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("reports first-run env file creation in version information", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-version-"));
    const config = loadRuntimeConfig({
      cwd,
      env: {
        NODE_ENV: "test",
        CC_FIRST_RUN_ENV_FILE_CREATED: "true",
        CC_FIRST_RUN_ENV_FILE_PATH: "/tmp/user/.cc/.env",
      },
    });
    const service = createSystemVersionService({
      config,
      logger: createLogger(config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: cwd },
      packageRoot: cwd,
      detectMode: () => "npm-global",
    });

    try {
      await expect(service.getVersion()).resolves.toMatchObject({
        firstRun: {
          envFileCreated: true,
          envFilePath: "/tmp/user/.cc/.env",
          secretKey: config.secretKey,
        },
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("returns Docker update guidance without running npm", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-version-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    const runCommand = vi.fn(() => Promise.resolve());
    const service = createSystemVersionService({
      config,
      logger: createLogger(config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: cwd },
      packageRoot: cwd,
      runCommand,
      detectMode: () => "docker",
    });

    try {
      await expect(service.update()).resolves.toMatchObject({
        applied: false,
        installMode: "docker",
        restartRequired: false,
        message: expect.stringContaining("In-container updates are disabled"),
        instructions: [
          expect.stringContaining("recreate the container"),
          expect.stringContaining("redeploy"),
          expect.stringContaining("workspace volume"),
        ],
      });
      expect(runCommand).not.toHaveBeenCalled();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("runs npm global update and records rollback history", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-version-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    let installedVersion = "1.0.0";
    const runCommand = vi.fn((_command: string, args: string[]) => {
      installedVersion = args.at(-1)?.replace("commandscenter@", "") ?? installedVersion;
      return Promise.resolve();
    });
    const runOutputCommand = vi.fn((command: string) =>
      Promise.resolve({
        stdout: command === "npm" ? ">=1.0.0" : `${installedVersion}\n`,
        stderr: "",
      }),
    );
    const drain = vi.fn(() => Promise.resolve());
    const exitProcess = vi.fn();
    const service = createSystemVersionService({
      config,
      logger: createLogger(config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: cwd },
      packageRoot: cwd,
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      runOutputCommand,
      drainController: { drain },
      exitProcess,
      detectMode: () => "npm-global",
    });

    try {
      await expect(service.update()).resolves.toMatchObject({
        applied: true,
        previousVersion: "1.0.0",
        targetVersion: "1.2.0",
        restartRequired: true,
      });
      expect(runCommand).toHaveBeenCalledWith("npm", ["install", "-g", "commandscenter@1.2.0"]);
      expect(runOutputCommand).toHaveBeenCalledWith("ccenter", ["--version"]);

      await expect(service.rollback()).resolves.toMatchObject({
        applied: true,
        targetVersion: "1.0.0",
      });
      expect(runCommand).toHaveBeenCalledWith("npm", ["install", "-g", "commandscenter@1.0.0"]);
    } finally {
      service.stop();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("exits with the restart-request code after a successful update", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-version-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    const runCommand = vi.fn(() => Promise.resolve());
    const runOutputCommand = vi.fn((command: string) =>
      Promise.resolve({
        stdout: command === "npm" ? ">=1.0.0" : "1.2.0\n",
        stderr: "",
      }),
    );
    const drain = vi.fn(() => Promise.resolve());
    const exitProcess = vi.fn();
    const service = createSystemVersionService({
      config,
      logger: createLogger(config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: cwd },
      packageRoot: cwd,
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      runOutputCommand,
      drainController: { drain },
      exitProcess,
      detectMode: () => "npm-global",
    });

    try {
      await service.update();

      await vi.waitFor(() => {
        expect(exitProcess).toHaveBeenCalledWith(75);
      });
      expect(drain).toHaveBeenCalledWith("manual");
    } finally {
      service.stop();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("refuses a concurrent update while another update is running", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-version-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    let installedVersion = "1.0.0";
    let finishInstall: (() => void) | undefined;
    const runCommand = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishInstall = () => {
            installedVersion = "1.2.0";
            resolve();
          };
        }),
    );
    const runOutputCommand = vi.fn((command: string) =>
      Promise.resolve({
        stdout: command === "npm" ? ">=1.0.0" : `${installedVersion}\n`,
        stderr: "",
      }),
    );
    const service = createSystemVersionService({
      config,
      logger: createLogger(config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: cwd },
      packageRoot: cwd,
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      runOutputCommand,
      exitProcess: vi.fn(),
      detectMode: () => "npm-global",
    });

    try {
      const firstUpdate = service.update();

      await vi.waitFor(() => {
        expect(runCommand).toHaveBeenCalledOnce();
      });

      await expect(service.update()).resolves.toMatchObject({
        applied: false,
        message: "A CommandsCenter update is already in progress.",
        restartRequired: false,
      });

      finishInstall?.();
      await expect(firstUpdate).resolves.toMatchObject({ applied: true });
      expect(runCommand).toHaveBeenCalledOnce();
    } finally {
      service.stop();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("refuses npm global update when target requires a newer Node major", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-version-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    const runCommand = vi.fn(() => Promise.resolve());
    const runOutputCommand = vi.fn(() => Promise.resolve({ stdout: ">=24.0.0", stderr: "" }));
    const service = createSystemVersionService({
      config,
      logger: createLogger(config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: cwd },
      packageRoot: cwd,
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      runOutputCommand,
      detectMode: () => "npm-global",
      getNodeMajor: () => 22,
    });

    try {
      await expect(service.update()).resolves.toMatchObject({
        applied: false,
        message: expect.stringContaining("requires Node >=24"),
        restartRequired: false,
      });
      expect(runCommand).not.toHaveBeenCalled();
    } finally {
      service.stop();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("allows npm global update when Node engine range only has an upper bound", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-version-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    let installedVersion = "1.0.0";
    const runCommand = vi.fn((_command: string, args: string[]) => {
      installedVersion = args.at(-1)?.replace("commandscenter@", "") ?? installedVersion;
      return Promise.resolve();
    });
    const runOutputCommand = vi.fn((command: string) =>
      Promise.resolve({
        stdout: command === "npm" ? "<22" : `${installedVersion}\n`,
        stderr: "",
      }),
    );
    const service = createSystemVersionService({
      config,
      logger: createLogger(config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: cwd },
      packageRoot: cwd,
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      runOutputCommand,
      exitProcess: vi.fn(),
      detectMode: () => "npm-global",
      getNodeMajor: () => 20,
    });

    try {
      await expect(service.update()).resolves.toMatchObject({
        applied: true,
        targetVersion: "1.2.0",
      });
      expect(runCommand).toHaveBeenCalledWith("npm", ["install", "-g", "commandscenter@1.2.0"]);
    } finally {
      service.stop();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("uses a lower-bound Node engine token after an upper-bound token", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-version-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    const runCommand = vi.fn(() => Promise.resolve());
    const runOutputCommand = vi.fn(() => Promise.resolve({ stdout: "<22 || >=24", stderr: "" }));
    const service = createSystemVersionService({
      config,
      logger: createLogger(config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: cwd },
      packageRoot: cwd,
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      runOutputCommand,
      detectMode: () => "npm-global",
      getNodeMajor: () => 22,
    });

    try {
      await expect(service.update()).resolves.toMatchObject({
        applied: false,
        message: expect.stringContaining("requires Node >=24"),
        restartRequired: false,
      });
      expect(runCommand).not.toHaveBeenCalled();
    } finally {
      service.stop();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("refuses npm global update when stale CommandsCenter npm staging dirs exist", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-version-"));
    const npmGlobalRoot = await mkdtemp(join(tmpdir(), "cc-global-"));
    const staleDir = join(npmGlobalRoot, ".commandscenter-stale");
    await mkdir(staleDir);
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    const runCommand = vi.fn(() => Promise.resolve());
    const service = createSystemVersionService({
      config,
      logger: createLogger(config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: cwd },
      packageRoot: cwd,
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      runOutputCommand: vi.fn(),
      detectMode: () => "npm-global",
      npmGlobalRoot,
    });

    try {
      await expect(service.update()).resolves.toMatchObject({
        applied: false,
        message: "CommandsCenter npm install refused because stale npm staging directories exist.",
        instructions: expect.arrayContaining([`sudo du -sh ${staleDir}`]),
        restartRequired: false,
      });
      expect(runCommand).not.toHaveBeenCalled();
    } finally {
      service.stop();
      await rm(cwd, { recursive: true, force: true });
      await rm(npmGlobalRoot, { recursive: true, force: true });
    }
  });

  it("refuses npm global rollback when stale CommandsCenter npm staging dirs exist", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-version-"));
    const npmGlobalRoot = await mkdtemp(join(tmpdir(), "cc-global-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    let installedVersion = "1.0.0";
    const runCommand = vi.fn((_command: string, args: string[]) => {
      installedVersion = args.at(-1)?.replace("commandscenter@", "") ?? installedVersion;
      return Promise.resolve();
    });
    const runOutputCommand = vi.fn((command: string) =>
      Promise.resolve({
        stdout: command === "npm" ? ">=1.0.0" : `${installedVersion}\n`,
        stderr: "",
      }),
    );
    const service = createSystemVersionService({
      config,
      logger: createLogger(config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: cwd },
      packageRoot: cwd,
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      runOutputCommand,
      exitProcess: vi.fn(),
      detectMode: () => "npm-global",
      npmGlobalRoot,
    });

    try {
      await expect(service.update()).resolves.toMatchObject({ applied: true });
      const staleDir = join(npmGlobalRoot, ".commandscenter-stale");
      await mkdir(staleDir);

      await expect(service.rollback()).resolves.toMatchObject({
        applied: false,
        message: "CommandsCenter npm install refused because stale npm staging directories exist.",
        instructions: expect.arrayContaining([`sudo du -sh ${staleDir}`]),
        restartRequired: false,
      });
      expect(runCommand).toHaveBeenCalledTimes(1);
    } finally {
      service.stop();
      await rm(cwd, { recursive: true, force: true });
      await rm(npmGlobalRoot, { recursive: true, force: true });
    }
  });

  it("refuses npm global rollback when target requires a newer Node major", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-version-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    let installedVersion = "1.0.0";
    const runCommand = vi.fn((_command: string, args: string[]) => {
      installedVersion = args.at(-1)?.replace("commandscenter@", "") ?? installedVersion;
      return Promise.resolve();
    });
    const runOutputCommand = vi.fn((command: string, args: string[]) => {
      if (command === "npm") {
        return Promise.resolve({
          stdout: args[1] === "commandscenter@1.0.0" ? ">=24.0.0" : ">=1.0.0",
          stderr: "",
        });
      }

      return Promise.resolve({ stdout: `${installedVersion}\n`, stderr: "" });
    });
    const service = createSystemVersionService({
      config,
      logger: createLogger(config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: cwd },
      packageRoot: cwd,
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      runOutputCommand,
      exitProcess: vi.fn(),
      detectMode: () => "npm-global",
      getNodeMajor: () => 22,
    });

    try {
      await expect(service.update()).resolves.toMatchObject({ applied: true });

      await expect(service.rollback()).resolves.toMatchObject({
        applied: false,
        message: expect.stringContaining("requires Node >=24"),
        restartRequired: false,
      });
      expect(runCommand).toHaveBeenCalledTimes(1);
    } finally {
      service.stop();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("restores the previous global version when update install fails", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-version-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    let installedVersion = "1.0.0";
    const runCommand = vi.fn((_command: string, args: string[]) => {
      const version = args.at(-1)?.replace("commandscenter@", "");
      if (version === "1.2.0") {
        return Promise.reject(new Error("npm exited with code 217"));
      }
      installedVersion = version ?? installedVersion;
      return Promise.resolve();
    });
    const runOutputCommand = vi.fn((command: string) =>
      Promise.resolve({
        stdout: command === "npm" ? ">=1.0.0" : `${installedVersion}\n`,
        stderr: "",
      }),
    );
    const exitProcess = vi.fn();
    const service = createSystemVersionService({
      config,
      logger: createLogger(config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: cwd },
      packageRoot: cwd,
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      runOutputCommand,
      exitProcess,
      detectMode: () => "npm-global",
    });

    try {
      await expect(service.update()).resolves.toMatchObject({
        applied: false,
        message: expect.stringContaining("Restored commandscenter 1.0.0"),
        restartRequired: false,
      });
      expect(runCommand).toHaveBeenCalledWith("npm", ["install", "-g", "commandscenter@1.2.0"]);
      expect(runCommand).toHaveBeenCalledWith("npm", ["install", "-g", "commandscenter@1.0.0"]);
      expect(exitProcess).not.toHaveBeenCalled();
    } finally {
      service.stop();
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("persists auto-update preference overrides in workspace settings", async () => {
    const testDb = await createTestDatabase();
    const service = createSystemVersionService({
      config: testDb.config,
      logger: createLogger(testDb.config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: testDb.cwd },
      packageRoot: testDb.cwd,
      db: testDb.client.db,
      detectMode: () => "npm-local",
    });

    try {
      await expect(service.getUpdatePreferences()).resolves.toEqual({
        autoUpdateEnabled: false,
        autoUpdateSource: "environment",
        environmentDefault: false,
      });

      await expect(service.setUpdatePreferences({ autoUpdateEnabled: true })).resolves.toEqual({
        autoUpdateEnabled: true,
        autoUpdateSource: "settings",
        environmentDefault: false,
      });

      await expect(service.getVersion()).resolves.toMatchObject({
        autoUpdateEnabled: true,
        autoUpdateSource: "settings",
      });
    } finally {
      await testDb.cleanup();
    }
  });
});
