/**
 * System upgrade lifecycle e2e — issue #96 §3
 *
 * Drives createSystemVersionService end to end against a real workspace dir
 * (for update-history.json) with injected command runners. Covers the periodic
 * check loop with auto-update, the drain → exit restart handshake, and the
 * failed-upgrade recovery paths that the unit tests do not reach.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/lib/logger";
import { loadRuntimeConfig, type RuntimeConfig } from "../../src/lib/runtime-config";
import { createSystemVersionService } from "../../src/services/system-version-service";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function makeConfig(env: Record<string, string> = {}): Promise<RuntimeConfig> {
  const cwd = await mkdtemp(join(tmpdir(), "cc-upgrade-"));
  tempDirs.push(cwd);
  return loadRuntimeConfig({ cwd, env: { NODE_ENV: "test", CC_LOG_LEVEL: "silent", ...env } });
}

function baseOptions(config: RuntimeConfig) {
  return {
    config,
    logger: createLogger(config),
    packageInfo: { name: "commandscenter", version: "1.0.0", packageRoot: config.paths.cwd },
    packageRoot: config.paths.cwd,
  };
}

describe("system upgrade lifecycle", () => {
  it("auto-updates on the periodic check loop when an update is available", async () => {
    const config = await makeConfig({ CC_AUTO_UPDATE: "true" });
    const runCommand = vi.fn(() => Promise.resolve());
    const runOutputCommand = vi.fn(() => Promise.resolve({ stdout: "1.2.0\n", stderr: "" }));
    const exitProcess = vi.fn();
    const drain = vi.fn(() => Promise.resolve());

    const service = createSystemVersionService({
      ...baseOptions(config),
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      runOutputCommand,
      drainController: { drain },
      exitProcess,
      detectMode: () => "npm-local",
    });

    try {
      service.start();

      // The immediate check finds 1.2.0 > 1.0.0 and, with auto-update on,
      // triggers the update install (npm-local: no -g flag).
      await vi.waitFor(() => {
        expect(runCommand).toHaveBeenCalledWith("npm", ["install", "commandscenter@1.2.0"]);
      });

      // The update schedules a drain + restart handshake.
      await vi.waitFor(() => {
        expect(drain).toHaveBeenCalledWith("manual");
        expect(exitProcess).toHaveBeenCalledWith(75);
      });

      // History was recorded on disk.
      const history = JSON.parse(await readFile(config.updates.historyFile, "utf8")) as {
        entries: { targetVersion: string }[];
      };
      expect(history.entries.at(-1)?.targetVersion).toBe("1.2.0");
    } finally {
      service.stop();
    }
  });

  it("stops the periodic loop so no further checks run", async () => {
    const config = await makeConfig({ CC_UPDATE_INTERVAL_MS: "5" });
    const fetchLatest = vi.fn(() => Promise.resolve("1.0.0"));
    const service = createSystemVersionService({
      ...baseOptions(config),
      fetchLatest,
      exitProcess: vi.fn(),
      detectMode: () => "npm-local",
    });

    service.start();
    await vi.waitFor(() => expect(fetchLatest).toHaveBeenCalled());
    service.stop();
    const callsAfterStop = fetchLatest.mock.calls.length;

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fetchLatest.mock.calls.length).toBe(callsAfterStop);
  });

  it("records the registry error on the version payload when the check fails", async () => {
    const config = await makeConfig();
    const service = createSystemVersionService({
      ...baseOptions(config),
      fetchLatest: () => Promise.reject(new Error("registry unreachable")),
      exitProcess: vi.fn(),
      detectMode: () => "npm-local",
    });

    const version = await service.checkNow();
    expect(version.error).toBe("registry unreachable");
    expect(version.updateAvailable).toBe(false);
  });

  it("restores the previous version when the upgrade install fails", async () => {
    const config = await makeConfig();
    // npm-local install always succeeds, but verify is skipped for npm-local, so
    // force the failure via the install command for the target only.
    const runCommand = vi.fn((_command: string, args: string[]) => {
      if (args.includes("commandscenter@1.2.0")) {
        return Promise.reject(new Error("network blip"));
      }
      return Promise.resolve();
    });
    const service = createSystemVersionService({
      ...baseOptions(config),
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      exitProcess: vi.fn(),
      detectMode: () => "npm-local",
    });

    const result = await service.update();
    expect(result.applied).toBe(false);
    expect(result.message).toContain("Restored commandscenter 1.0.0");
    // Restore reinstalled the previous version.
    expect(runCommand).toHaveBeenCalledWith("npm", ["install", "commandscenter@1.0.0"]);
  });

  it("reports a double failure when update and the automatic rollback both fail", async () => {
    const config = await makeConfig();
    const runCommand = vi.fn(() => Promise.reject(new Error("npm exploded")));
    const service = createSystemVersionService({
      ...baseOptions(config),
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      exitProcess: vi.fn(),
      detectMode: () => "npm-local",
    });

    const result = await service.update();
    expect(result.applied).toBe(false);
    expect(result.message).toContain("automatic rollback");
    expect(result.instructions?.join(" ")).toContain("install-ccenter-service.sh");
  });

  it("rolls back to the recorded previous version and restarts", async () => {
    const config = await makeConfig();
    const runCommand = vi.fn(() => Promise.resolve());
    const runOutputCommand = vi.fn(() => Promise.resolve({ stdout: "1.2.0\n", stderr: "" }));
    const drain = vi.fn(() => Promise.resolve());
    const exitProcess = vi.fn();
    const service = createSystemVersionService({
      ...baseOptions(config),
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      runOutputCommand,
      drainController: { drain },
      exitProcess,
      detectMode: () => "npm-local",
    });

    try {
      await service.update(); // records history 1.0.0 -> 1.2.0
      const rollback = await service.rollback();
      expect(rollback).toMatchObject({ applied: true, targetVersion: "1.0.0" });
      await vi.waitFor(() => expect(exitProcess).toHaveBeenCalledWith(75));
    } finally {
      service.stop();
    }
  });

  it("reports when there is no previous version to roll back to", async () => {
    const config = await makeConfig();
    const service = createSystemVersionService({
      ...baseOptions(config),
      fetchLatest: () => Promise.resolve("1.0.0"),
      exitProcess: vi.fn(),
      detectMode: () => "npm-local",
    });

    const result = await service.rollback();
    expect(result.applied).toBe(false);
    expect(result.message).toContain("No previous commandscenter version");
  });

  it("reports when the rollback install itself fails", async () => {
    const config = await makeConfig();
    let installedTarget = false;
    const runCommand = vi.fn((_command: string, args: string[]) => {
      if (args.includes("commandscenter@1.2.0")) {
        installedTarget = true;
        return Promise.resolve();
      }
      // The rollback reinstall (1.0.0) fails.
      if (installedTarget) {
        return Promise.reject(new Error("rollback network error"));
      }
      return Promise.resolve();
    });
    const service = createSystemVersionService({
      ...baseOptions(config),
      fetchLatest: () => Promise.resolve("1.2.0"),
      runCommand,
      exitProcess: vi.fn(),
      detectMode: () => "npm-local",
    });

    await service.update();
    const result = await service.rollback();
    expect(result.applied).toBe(false);
    expect(result.message).toContain("Rollback to commandscenter 1.0.0 failed");
    expect(result.instructions?.join(" ")).toContain("install-ccenter-service.sh");
  });

  it("stores auto-update preference overrides in memory when no db is present", async () => {
    const config = await makeConfig();
    const service = createSystemVersionService({
      ...baseOptions(config),
      fetchLatest: () => Promise.resolve("1.0.0"),
      exitProcess: vi.fn(),
      detectMode: () => "npm-local",
    });

    const preferences = await service.setUpdatePreferences({ autoUpdateEnabled: true });
    expect(preferences.autoUpdateEnabled).toBe(true);
    expect(preferences.autoUpdateSource).toBe("environment");
    expect((await service.getVersion()).autoUpdateEnabled).toBe(true);
  });
});
