import { mkdtemp, rm } from "node:fs/promises";
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
        instructions: ["docker compose pull", "docker compose up -d", expect.any(String)],
      });
      expect(runCommand).not.toHaveBeenCalled();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("runs npm global update and records rollback history", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cc-version-"));
    const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
    const runCommand = vi.fn(() => Promise.resolve());
    const drain = vi.fn(() => Promise.resolve());
    const exitProcess = vi.fn();
    const service = createSystemVersionService({
      config,
      logger: createLogger(config),
      packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: cwd },
      packageRoot: cwd,
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
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
