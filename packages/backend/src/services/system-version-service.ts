import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  systemUpdatePreferencesSchema,
  type InstallMode,
  type SystemUpdatePreferences,
  type SystemUpdateResult,
  type SystemVersion,
} from "@cc/shared/schemas";
import type { Logger } from "pino";
import { z } from "zod";

import type { AppDb } from "../db/client.js";
import { getSetting, upsertSettingFilefirst } from "../db/helpers.js";
import type { DrainController } from "../lib/drain-protocol.js";
import type { PackageInfo } from "../lib/package-info.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";

const AUTO_UPDATE_SETTING_KEY = "system.autoUpdateEnabled";
const UPDATE_RESTART_EXIT_CODE = 75;

const registryResponseSchema = z.object({
  version: z.string().min(1),
});

const updateHistoryEntrySchema = z.object({
  previousVersion: z.string().min(1),
  targetVersion: z.string().min(1),
  appliedAt: z.string().datetime(),
  installMode: z.enum(["npm-global", "npm-local"]),
});

const updateHistorySchema = z.object({
  entries: z.array(updateHistoryEntrySchema),
});

type UpdateHistory = z.infer<typeof updateHistorySchema>;
type UpdateHistoryEntry = z.infer<typeof updateHistoryEntrySchema>;
type CommandRunner = (command: string, args: string[]) => Promise<void>;

export type SystemVersionService = {
  start(): void;
  stop(): void;
  getVersion(): Promise<SystemVersion>;
  checkNow(): Promise<SystemVersion>;
  getUpdatePreferences(): Promise<SystemUpdatePreferences>;
  setUpdatePreferences(input: { autoUpdateEnabled: boolean }): Promise<SystemUpdatePreferences>;
  update(): Promise<SystemUpdateResult>;
  rollback(): Promise<SystemUpdateResult>;
};

export function detectInstallMode(options: {
  env: NodeJS.ProcessEnv;
  packageRoot: string;
  dockerEnvPath?: string;
  globalRoot?: string;
  resolveGlobalRoot?: () => string | undefined;
}): InstallMode {
  if (isTruthy(options.env["CC_DOCKER"]) || existsSync(options.dockerEnvPath ?? "/.dockerenv")) {
    return "docker";
  }

  const globalRoot =
    options.globalRoot ??
    nonEmpty(options.env["CC_NPM_GLOBAL_ROOT"]) ??
    options.resolveGlobalRoot?.() ??
    resolveNpmGlobalRoot();

  if (globalRoot && isPathAncestor(globalRoot, options.packageRoot)) {
    return "npm-global";
  }

  return "npm-local";
}

export function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < 3; index++) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);

    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

export function createSystemVersionService(options: {
  config: RuntimeConfig;
  logger: Logger;
  packageInfo: PackageInfo;
  packageRoot: string;
  db?: AppDb;
  env?: NodeJS.ProcessEnv;
  drainController?: DrainController;
  fetchLatest?: () => Promise<string>;
  runCommand?: CommandRunner;
  exitProcess?: (code: number) => never | void;
  detectMode?: () => InstallMode;
}): SystemVersionService {
  const env = options.env ?? process.env;
  const installMode = options.detectMode
    ? options.detectMode()
    : detectInstallMode({
        env,
        packageRoot: options.packageRoot,
        dockerEnvPath: nonEmpty(env["CC_DOCKER_ENV_PATH"]),
      });
  const runCommand = options.runCommand ?? spawnCommand;
  const exitProcess = options.exitProcess ?? ((code: number) => process.exit(code));
  const fetchLatest =
    options.fetchLatest ?? (() => fetchLatestVersion(options.config.updates.registryUrl));
  let cached = createInitialVersion(
    options.packageInfo.version,
    installMode,
    options.config.updates.autoUpdate,
    options.config.firstRun,
  );
  let interval: NodeJS.Timeout | undefined;
  let checking: Promise<SystemVersion> | undefined;

  const service: SystemVersionService = {
    start() {
      if (!options.config.updates.enabled) {
        return;
      }

      void runCheck();
      interval = setInterval(() => {
        void runCheck();
      }, options.config.updates.intervalMs);
      interval.unref();
    },

    stop() {
      if (interval) {
        clearInterval(interval);
        interval = undefined;
      }
    },

    getVersion() {
      return Promise.resolve(cached);
    },

    checkNow() {
      return runCheck();
    },

    getUpdatePreferences() {
      return readUpdatePreferences();
    },

    async setUpdatePreferences(input) {
      if (!options.db) {
        const preferences = systemUpdatePreferencesSchema.parse({
          autoUpdateEnabled: input.autoUpdateEnabled,
          autoUpdateSource: "environment",
          environmentDefault: options.config.updates.autoUpdate,
        });
        cached = applyUpdatePreferences(cached, preferences);
        return preferences;
      }

      await upsertSettingFilefirst(
        options.db,
        options.config,
        AUTO_UPDATE_SETTING_KEY,
        input.autoUpdateEnabled,
      );
      const preferences = await readUpdatePreferences();
      cached = applyUpdatePreferences(cached, preferences);
      return preferences;
    },

    async update() {
      if (installMode === "docker") {
        return dockerGuidance();
      }

      const latest = (await runCheck()).latest;
      const targetVersion = latest ?? options.packageInfo.version;
      await runNpmInstall(runCommand, installMode, targetVersion);
      await appendHistory(options.config.updates.historyFile, {
        previousVersion: options.packageInfo.version,
        targetVersion,
        appliedAt: new Date().toISOString(),
        installMode,
      });

      const result: SystemUpdateResult = {
        applied: true,
        installMode,
        message: `Updated commandscenter to ${targetVersion}. Restarting process.`,
        previousVersion: options.packageInfo.version,
        targetVersion,
        restartRequired: true,
      };

      scheduleRestart(options.drainController, exitProcess, options.logger);
      return result;
    },

    async rollback() {
      if (installMode === "docker") {
        return dockerGuidance();
      }

      const previous = await readPreviousVersion(options.config.updates.historyFile);

      if (!previous) {
        return {
          applied: false,
          installMode,
          message: "No previous commandscenter version is recorded in this workspace.",
          restartRequired: false,
        };
      }

      await runNpmInstall(runCommand, installMode, previous.previousVersion);

      const result: SystemUpdateResult = {
        applied: true,
        installMode,
        message: `Rolled back commandscenter to ${previous.previousVersion}. Restarting process.`,
        previousVersion: options.packageInfo.version,
        targetVersion: previous.previousVersion,
        restartRequired: true,
      };

      scheduleRestart(options.drainController, exitProcess, options.logger);
      return result;
    },
  };

  return service;

  async function runCheck(): Promise<SystemVersion> {
    if (checking) {
      return checking;
    }

    checking = (async () => {
      try {
        const latest = await fetchLatest();
        cached = {
          current: options.packageInfo.version,
          latest,
          updateAvailable: compareVersions(latest, options.packageInfo.version) > 0,
          installMode,
          firstRun: options.config.firstRun.envFileCreated ? options.config.firstRun : undefined,
          ...(await readUpdatePreferences()),
          checkedAt: new Date().toISOString(),
        };

        if (cached.autoUpdateEnabled && cached.updateAvailable && installMode !== "docker") {
          void service.update();
        }
      } catch (error) {
        cached = {
          ...cached,
          error: formatError(error),
          checkedAt: new Date().toISOString(),
        };
        options.logger.warn({ err: error }, "failed to check commandscenter update status");
      } finally {
        checking = undefined;
      }

      return cached;
    })();

    return checking;
  }

  async function readUpdatePreferences(): Promise<SystemUpdatePreferences> {
    const setting = options.db
      ? await getSetting<boolean>(options.db, AUTO_UPDATE_SETTING_KEY)
      : undefined;

    return systemUpdatePreferencesSchema.parse({
      autoUpdateEnabled: setting ?? options.config.updates.autoUpdate,
      autoUpdateSource: setting === undefined ? "environment" : "settings",
      environmentDefault: options.config.updates.autoUpdate,
    });
  }
}

async function fetchLatestVersion(registryUrl: string): Promise<string> {
  const response = await fetch(registryUrl, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`npm registry returned ${String(response.status)}`);
  }

  const parsed = registryResponseSchema.parse(await response.json());
  return parsed.version;
}

async function runNpmInstall(
  runCommand: CommandRunner,
  installMode: Exclude<InstallMode, "docker">,
  version: string,
): Promise<void> {
  if (installMode === "npm-global") {
    await runCommand("npm", ["install", "-g", `commandscenter@${version}`]);
    return;
  }

  await runCommand("npm", ["install", `commandscenter@${version}`]);
}

function spawnCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${String(code)}`));
    });
  });
}

function resolveNpmGlobalRoot(): string | undefined {
  const result = spawnSync("npm", ["root", "-g"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0 || result.error) {
    return undefined;
  }

  const output = result.stdout.trim();
  return output.length > 0 ? output : undefined;
}

function dockerGuidance(): SystemUpdateResult {
  return {
    applied: false,
    installMode: "docker",
    message: "Docker installations cannot update themselves from inside the container.",
    restartRequired: false,
    instructions: [
      "docker compose pull",
      "docker compose up -d",
      "For automated updates, run Watchtower or your platform's image update mechanism.",
    ],
  };
}

function scheduleRestart(
  drainController: DrainController | undefined,
  exitProcess: (code: number) => never | void,
  logger: Logger,
): void {
  setTimeout(() => {
    void (async () => {
      try {
        await drainController?.drain("manual");
        exitProcess(UPDATE_RESTART_EXIT_CODE);
      } catch (error) {
        logger.error({ err: error }, "failed to drain runtime after update");
        exitProcess(1);
      }
    })();
  }, 100).unref();
}

async function appendHistory(path: string, entry: UpdateHistoryEntry): Promise<void> {
  const history = await readHistory(path);
  history.entries.push(entry);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}

async function readPreviousVersion(path: string): Promise<UpdateHistoryEntry | undefined> {
  const history = await readHistory(path);
  return history.entries.at(-1);
}

async function readHistory(path: string): Promise<UpdateHistory> {
  try {
    return updateHistorySchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (isMissingFileError(error)) {
      return { entries: [] };
    }

    throw error;
  }
}

function createInitialVersion(
  current: string,
  installMode: InstallMode,
  autoUpdateEnabled: boolean,
  firstRun: SystemVersion["firstRun"],
): SystemVersion {
  return {
    current,
    updateAvailable: false,
    installMode,
    firstRun: firstRun?.envFileCreated ? firstRun : undefined,
    autoUpdateEnabled,
    autoUpdateSource: "environment",
  };
}

function applyUpdatePreferences(
  version: SystemVersion,
  preferences: SystemUpdatePreferences,
): SystemVersion {
  return {
    ...version,
    autoUpdateEnabled: preferences.autoUpdateEnabled,
    autoUpdateSource: preferences.autoUpdateSource,
  };
}

function parseVersion(version: string): [number, number, number] {
  const [major = "0", minor = "0", patch = "0"] = version.replace(/^v/, "").split(/[.-]/);
  return [
    Number.parseInt(major, 10) || 0,
    Number.parseInt(minor, 10) || 0,
    Number.parseInt(patch, 10) || 0,
  ];
}

function isPathAncestor(parent: string, child: string): boolean {
  const normalizedParent = parent.replace(/\/$/, "");
  return child === normalizedParent || child.startsWith(`${normalizedParent}/`);
}

function isTruthy(value: string | undefined): boolean {
  return value !== undefined && ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
