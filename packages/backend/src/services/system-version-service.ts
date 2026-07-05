import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
type CommandOutput = {
  stdout: string;
  stderr: string;
};
type OutputCommandRunner = (command: string, args: string[]) => Promise<CommandOutput>;

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
  runOutputCommand?: OutputCommandRunner;
  exitProcess?: (code: number) => never | void;
  detectMode?: () => InstallMode;
  npmGlobalRoot?: string;
  getNodeMajor?: () => number;
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
  const runOutputCommand = options.runOutputCommand ?? spawnOutputCommand;
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
  let activeOperation: "update" | "rollback" | undefined;

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

      return runExclusive("update", async () => {
        const latest = (await runCheck()).latest;
        const targetVersion = latest ?? options.packageInfo.version;
        const previousVersion = options.packageInfo.version;
        const preflightResult = await preflightNpmInstall(targetVersion);

        if (preflightResult) {
          return preflightResult;
        }

        try {
          await runNpmInstall(runCommand, npmInstallMode(), targetVersion);
          await verifyNpmInstall(targetVersion);
        } catch (error) {
          options.logger.error({ err: error, targetVersion }, "commandscenter update failed");
          return restorePreviousVersion(previousVersion, targetVersion, error);
        }

        await appendHistory(options.config.updates.historyFile, {
          previousVersion,
          targetVersion,
          appliedAt: new Date().toISOString(),
          installMode,
        });

        const result: SystemUpdateResult = {
          applied: true,
          installMode,
          message: `Updated commandscenter to ${targetVersion}. Restarting process.`,
          previousVersion,
          targetVersion,
          restartRequired: true,
        };

        scheduleRestart(options.drainController, exitProcess, options.logger);
        return result;
      });
    },

    async rollback() {
      if (installMode === "docker") {
        return dockerGuidance();
      }

      return runExclusive("rollback", async () => {
        const previous = await readPreviousVersion(options.config.updates.historyFile);

        if (!previous) {
          return {
            applied: false,
            installMode,
            message: "No previous commandscenter version is recorded in this workspace.",
            restartRequired: false,
          };
        }

        const preflightResult = await preflightNpmInstall(previous.previousVersion);

        if (preflightResult) {
          return preflightResult;
        }

        try {
          await runNpmInstall(runCommand, npmInstallMode(), previous.previousVersion);
          await verifyNpmInstall(previous.previousVersion);
        } catch (error) {
          options.logger.error(
            { err: error, targetVersion: previous.previousVersion },
            "commandscenter rollback failed",
          );
          return {
            applied: false,
            installMode,
            message: `Rollback to commandscenter ${previous.previousVersion} failed.`,
            previousVersion: options.packageInfo.version,
            targetVersion: previous.previousVersion,
            restartRequired: false,
            instructions: recoveryInstructions(formatError(error)),
          };
        }

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
      });
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

  async function runExclusive(
    operation: "update" | "rollback",
    callback: () => Promise<SystemUpdateResult>,
  ): Promise<SystemUpdateResult> {
    if (activeOperation) {
      return {
        applied: false,
        installMode,
        message: `A CommandsCenter ${activeOperation} is already in progress.`,
        restartRequired: false,
        instructions: [
          "Wait for the current operation to finish, then refresh Settings and try again.",
          "If the operation was interrupted, check `journalctl -u commandscenter -n 100 --no-pager` before retrying.",
        ],
      };
    }

    activeOperation = operation;
    try {
      return await callback();
    } finally {
      activeOperation = undefined;
    }
  }

  async function preflightNpmInstall(
    targetVersion: string,
  ): Promise<SystemUpdateResult | undefined> {
    if (installMode !== "npm-global") {
      return undefined;
    }

    const staleDirs = await findStaleCommandsCenterDirs(options.npmGlobalRoot);
    if (staleDirs.length > 0) {
      return {
        applied: false,
        installMode,
        message: "CommandsCenter npm install refused because stale npm staging directories exist.",
        previousVersion: options.packageInfo.version,
        targetVersion,
        restartRequired: false,
        instructions: staleDirectoryInstructions(staleDirs),
      };
    }

    const requiredMajor = await targetRequiredNodeMajor(runOutputCommand, targetVersion);
    const currentMajor = options.getNodeMajor?.() ?? Number.parseInt(process.versions.node, 10);
    if (requiredMajor !== undefined && currentMajor < requiredMajor) {
      return {
        applied: false,
        installMode,
        message: `commandscenter@${targetVersion} requires Node >=${String(requiredMajor)}, but this process is running Node ${process.version}.`,
        previousVersion: options.packageInfo.version,
        targetVersion,
        restartRequired: false,
        instructions: [
          `Upgrade Node to ${String(requiredMajor)} or newer, then rerun the CommandsCenter service installer.`,
          "Recommended repair command: curl -fsSL https://raw.githubusercontent.com/MaestroError/commands-center/main/scripts/install-ccenter-service.sh | bash",
        ],
      };
    }

    return undefined;
  }

  async function restorePreviousVersion(
    previousVersion: string,
    targetVersion: string,
    cause: unknown,
  ): Promise<SystemUpdateResult> {
    try {
      await runNpmInstall(runCommand, npmInstallMode(), previousVersion);
      await verifyNpmInstall(previousVersion);
      return {
        applied: false,
        installMode,
        message: `Upgrade to commandscenter ${targetVersion} failed. Restored commandscenter ${previousVersion}; the running service was not restarted.`,
        previousVersion,
        targetVersion,
        restartRequired: false,
        instructions: [
          `Original error: ${formatError(cause)}`,
          "Review the npm output in `journalctl -u commandscenter --no-pager` before retrying.",
        ],
      };
    } catch (rollbackError) {
      options.logger.error(
        { err: rollbackError, previousVersion, targetVersion },
        "commandscenter rollback after failed update also failed",
      );
      return {
        applied: false,
        installMode,
        message: `Upgrade to commandscenter ${targetVersion} failed, and automatic rollback to ${previousVersion} also failed.`,
        previousVersion,
        targetVersion,
        restartRequired: false,
        instructions: recoveryInstructions(
          `update failed: ${formatError(cause)}; rollback failed: ${formatError(rollbackError)}`,
        ),
      };
    }
  }

  function npmInstallMode(): Exclude<InstallMode, "docker"> {
    if (installMode === "docker") {
      throw new Error("Docker installations cannot run npm package installs.");
    }

    return installMode;
  }

  async function verifyNpmInstall(expectedVersion: string): Promise<void> {
    if (installMode !== "npm-global") {
      return;
    }

    await verifyInstalledCcenter(runOutputCommand, expectedVersion);
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

async function targetRequiredNodeMajor(
  runOutputCommand: OutputCommandRunner,
  targetVersion: string,
): Promise<number | undefined> {
  try {
    const result = await runOutputCommand("npm", [
      "view",
      `commandscenter@${targetVersion}`,
      "engines.node",
    ]);
    return parseNodeMajorLowerBound(result.stdout);
  } catch {
    return undefined;
  }
}

function parseNodeMajorLowerBound(range: string): number | undefined {
  const majors = new Set<number>();
  const operatorPattern = /(?:^|[\s|])(?:>=|>|\^|~)\s*v?(\d+)/g;
  let match: RegExpExecArray | null;

  while ((match = operatorPattern.exec(range)) !== null) {
    majors.add(Number.parseInt(match[1] ?? "", 10));
  }

  const leadingMajor = range.match(/^\s*v?(\d+)/);
  if (leadingMajor) {
    majors.add(Number.parseInt(leadingMajor[1] ?? "", 10));
  }

  return majors.size > 0 ? Math.min(...majors) : undefined;
}

async function verifyInstalledCcenter(
  runOutputCommand: OutputCommandRunner,
  expectedVersion: string,
): Promise<void> {
  const result = await runOutputCommand("ccenter", ["--version"]);
  const actualVersion = result.stdout.trim();

  if (actualVersion !== expectedVersion) {
    throw new Error(
      `ccenter --version returned ${actualVersion || "empty output"}, expected ${expectedVersion}`,
    );
  }
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

function spawnOutputCommand(command: string, args: string[]): Promise<CommandOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("exit", (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };

      if (code === 0) {
        resolve(result);
        return;
      }

      const output = result.stderr.trim() || result.stdout.trim();
      const details = output ? `: ${output}` : "";
      reject(new Error(`${command} exited with code ${String(code)}${details}`));
    });
  });
}

async function findStaleCommandsCenterDirs(npmGlobalRoot: string | undefined): Promise<string[]> {
  const root = npmGlobalRoot ?? resolveNpmGlobalRoot();
  if (!root) {
    return [];
  }

  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(".commandscenter-"))
      .map((entry) => `${root.replace(/\/$/, "")}/${entry.name}`)
      .sort();
  } catch {
    return [];
  }
}

function staleDirectoryInstructions(paths: string[]): string[] {
  const root = dirname(paths[0] ?? "/usr/lib/node_modules");

  return [
    "Stop the service and make sure no npm install is running:",
    "sudo systemctl stop commandscenter",
    "pgrep -a npm || true",
    "Inspect the stale directories:",
    ...paths.map((path) => `sudo du -sh ${path}`),
    "If no npm process is running, remove the stale CommandsCenter npm staging directories:",
    `sudo find ${root} -maxdepth 1 -type d -name '.commandscenter-*' -exec rm -rf {} +`,
    "Then rerun the CommandsCenter service installer.",
  ];
}

function recoveryInstructions(error: string): string[] {
  return [
    `Error: ${error}`,
    "Repair with the CommandsCenter service installer:",
    "curl -fsSL https://raw.githubusercontent.com/MaestroError/commands-center/main/scripts/install-ccenter-service.sh | bash",
    "Then verify `command -v ccenter`, `ccenter --version`, and `sudo systemctl status commandscenter --no-pager -l`.",
  ];
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
    message:
      "In-container updates are disabled for Docker installations. Redeploy the container from a newer image to upgrade.",
    restartRequired: false,
    instructions: [
      "Pull or rebuild a newer image on the host, then recreate the container.",
      "On managed platforms (Coolify, Portainer, Dokploy, etc.), trigger a redeploy; force a no-cache rebuild when the image is built from the Dockerfile.",
      "The mounted workspace volume is preserved across the redeploy.",
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
