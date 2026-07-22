import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import fastifyStatic from "@fastify/static";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  createLogger,
  createOwnerAccessService,
  createSystemVersionService,
  bootstrapWorkspaceRoot,
  loadEnvFile,
  loadRuntimeConfig,
  readPackageInfo,
  rollbackLatestWorkspaceMigration,
  runClaimCodeCommand,
  runWorkspaceMigrations,
  startServerRuntime,
} from "@cc/backend";

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
const ENV_FILE_CREATING_COMMANDS = new Set(["start", "serve"]);
const PUBLIC_OAUTH_INTERACTION_PAGE_PATTERN = /^\/oauth-interaction\/[^/]+$/;
const ENV_FILE_REQUIRING_COMMANDS = new Set([
  "claim",
  "claim-code",
  "filesystem-migrate",
  "filesystem-rollback",
]);

export type CliCommand =
  | "start"
  | "serve"
  | "upgrade"
  | "claim"
  | "claim-code"
  | "filesystem-migrate"
  | "filesystem-rollback";

export type CliArgs = {
  command: string;
  host?: string;
  port?: number;
  envFile?: string;
  format: "text" | "json";
  help: boolean;
  version: boolean;
  rollback: boolean;
  yes: boolean;
};

export function printHelp(): void {
  console.log(`
  ccenter — CommandsCenter CLI

  Usage:
    ccenter start [options]    Start the server with web UI
    ccenter serve [options]    Start the API server only (no frontend)
    ccenter upgrade [options]  Upgrade the global/local package
    ccenter claim [options]    Generate a workspace claim/reclaim code
    ccenter claim-code [options]
                               Alias for claim
    ccenter filesystem-migrate [options]
                               Run pending workspace filesystem migrations
    ccenter filesystem-rollback [options]
                               Roll back the latest workspace filesystem migration
    ccenter --help             Show this help
    ccenter --version          Show version

  Options:
    --port, -p <number>        Port to listen on (default: ${String(DEFAULT_PORT)})
    --host, -h <string>        Host to bind to (default: ${DEFAULT_HOST})
    --cc-env-file <path>       Load environment variables from a file
    --format <text|json>       Output format for claim commands (default: text)
    --rollback                 Reinstall the previous recorded version
    --yes, -y                  Confirm claim-code rotation prompts
`);
}

export function parseCliArgs(args: string[]): CliArgs {
  const command = args[0] ?? "start";
  let port: number | undefined;
  let host: string | undefined;
  let envFile: string | undefined;
  let format: "text" | "json" = "text";

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if ((arg === "--port" || arg === "-p") && next) {
      port = Number.parseInt(next, 10);
      i++;
      continue;
    }

    if ((arg === "--cc-env-file" || arg === "--env-file") && next) {
      envFile = next;
      i++;
      continue;
    }

    if ((arg === "--host" || arg === "-h") && next) {
      host = next;
      i++;
      continue;
    }

    if (arg === "--format" && (next === "text" || next === "json")) {
      format = next;
      i++;
    }
  }

  return {
    command,
    host,
    port,
    envFile,
    format,
    help: args.includes("--help"),
    version: args.includes("--version"),
    rollback: args.includes("--rollback"),
    yes: args.includes("--yes") || args.includes("-y"),
  };
}

export async function runCli(args: string[]): Promise<void> {
  const parsedArgs = parseCliArgs(args);

  if (parsedArgs.help) {
    printHelp();
    return;
  }

  if (parsedArgs.version) {
    console.log(readPackageInfo().version);
    return;
  }

  if (
    ![
      "start",
      "serve",
      "upgrade",
      "claim",
      "claim-code",
      "filesystem-migrate",
      "filesystem-rollback",
    ].includes(parsedArgs.command)
  ) {
    console.error(`Unknown command: ${parsedArgs.command}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  loadCliEnv(parsedArgs);
  process.env["NODE_ENV"] ??= "production";

  if (parsedArgs.command === "upgrade") {
    await runUpgrade(parsedArgs.rollback);
    return;
  }

  if (parsedArgs.command === "claim" || parsedArgs.command === "claim-code") {
    await runClaim({ yes: parsedArgs.yes, format: parsedArgs.format });
    return;
  }

  if (parsedArgs.command === "filesystem-migrate") {
    await runFilesystemMigrate();
    return;
  }

  if (parsedArgs.command === "filesystem-rollback") {
    await runFilesystemRollback();
    return;
  }

  const staticAssetsDir = resolveStaticAssetsDir();

  await startServerRuntime({
    env: process.env,
    overrides: {
      host: parsedArgs.host,
      port: parsedArgs.port,
    },
    register:
      parsedArgs.command === "start" || parsedArgs.command === "serve"
        ? async (server) => {
            // Apply to every response in both start (SPA + API) and serve (API-only)
            // mode, regardless of whether static assets are present, so non-HTML/API
            // endpoints stay unindexable too.
            server.addHook("onSend", async (request, reply, payload) => {
              reply.header("X-Robots-Tag", "noindex, nofollow");

              if (
                PUBLIC_OAUTH_INTERACTION_PAGE_PATTERN.test(
                  new URL(request.url, "http://localhost").pathname,
                )
              ) {
                reply.header("Cache-Control", "no-store");
                reply.header("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'none'");
                reply.header("Referrer-Policy", "no-referrer");
                reply.header("X-Frame-Options", "DENY");
              }

              return payload;
            });

            // The SPA and its fallback are only served in start mode.
            if (
              parsedArgs.command !== "start" ||
              !staticAssetsDir ||
              !existsSync(staticAssetsDir)
            ) {
              return;
            }

            await server.register(fastifyStatic, {
              root: staticAssetsDir,
              wildcard: false,
            });

            server.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
              return reply.sendFile("index.html");
            });
          }
        : undefined,
  });
}

async function runFilesystemMigrate(): Promise<void> {
  const config = loadRuntimeConfig();
  const logger = createLogger(config);
  await bootstrapWorkspaceRoot(config);

  const result = await runWorkspaceMigrations({ config, logger });

  if (result.applied.length === 0) {
    console.log("No pending workspace filesystem migrations.");
    return;
  }

  for (const migration of result.applied) {
    console.log(`Applied workspace filesystem migration: ${migration.id}`);
  }
}

async function runFilesystemRollback(): Promise<void> {
  const config = loadRuntimeConfig();
  const logger = createLogger(config);
  await bootstrapWorkspaceRoot(config);

  const result = await rollbackLatestWorkspaceMigration({ config, logger });

  if (!result.rolledBack) {
    console.log("No applied workspace filesystem migrations to roll back.");
    return;
  }

  console.log(`Rolled back workspace filesystem migration: ${result.rolledBack.id}`);
}

async function runClaim(options: { yes: boolean; format: "text" | "json" }): Promise<void> {
  const config = loadRuntimeConfig();
  const service = createOwnerAccessService({
    config,
    logger: createLogger(config, process.stderr),
  });

  for (const line of await runClaimCodeCommand({
    config,
    ownerAccessService: service,
    yes: options.yes,
    format: options.format,
  })) {
    console.log(line);
  }
}

async function runUpgrade(rollback: boolean): Promise<void> {
  const config = loadRuntimeConfig();
  const logger = createLogger(config);
  const packageInfo = readPackageInfo();
  const service = createSystemVersionService({
    config,
    logger,
    packageInfo,
    packageRoot: packageInfo.packageRoot,
  });
  const result = rollback ? await service.rollback() : await service.update();

  console.log(result.message);

  for (const instruction of result.instructions ?? []) {
    console.log(instruction);
  }
}

function loadCliEnv(parsedArgs: CliArgs): void {
  if (parsedArgs.envFile) {
    if (ENV_FILE_CREATING_COMMANDS.has(parsedArgs.command) && !existsSync(parsedArgs.envFile)) {
      warnBeforeCreatingEnvFile(parsedArgs.envFile);
      // Always create the file; only fall back to the generated secret when CC_SECRET_KEY is
      // not already provided via the environment. Gating creation on the secret being unset
      // caused a crash loop when an operator supplied CC_SECRET_KEY (env file never written).
      const generatedSecret = createDefaultEnvFile(parsedArgs.envFile, {
        host: parsedArgs.host ?? process.env["CC_HOST"],
        port: parsedArgs.port?.toString() ?? process.env["CC_PORT"],
        dataDir: process.env["CC_DATA_DIR"] ?? resolve(dirname(parsedArgs.envFile), "data"),
        workspaceDir:
          process.env["CC_WORKSPACE_DIR"] ?? resolve(dirname(parsedArgs.envFile), "workspace"),
      });
      process.env["CC_SECRET_KEY"] ??= generatedSecret;
      process.env["CC_FIRST_RUN_ENV_FILE_CREATED"] = "true";
      process.env["CC_FIRST_RUN_ENV_FILE_PATH"] = parsedArgs.envFile;
    }

    if (ENV_FILE_REQUIRING_COMMANDS.has(parsedArgs.command) && !existsSync(parsedArgs.envFile)) {
      throw new Error(
        `Env file not found: ${parsedArgs.envFile}. Start CommandsCenter first with ccenter start --cc-env-file "${parsedArgs.envFile}", or pass an existing env file.`,
      );
    }

    loadEnvFile(parsedArgs.envFile);
    return;
  }

  const defaultEnvFile = resolve(homedir(), ".cc", ".env");

  if (ENV_FILE_CREATING_COMMANDS.has(parsedArgs.command) && !existsSync(defaultEnvFile)) {
    const generatedSecret = createDefaultEnvFile(defaultEnvFile, {
      host: parsedArgs.host ?? process.env["CC_HOST"],
      port: parsedArgs.port?.toString() ?? process.env["CC_PORT"],
      dataDir: process.env["CC_DATA_DIR"] ?? resolve(homedir(), ".cc", "data"),
      workspaceDir: process.env["CC_WORKSPACE_DIR"] ?? resolve(homedir(), ".cc", "workspace"),
    });
    process.env["CC_SECRET_KEY"] ??= generatedSecret;
    process.env["CC_FIRST_RUN_ENV_FILE_CREATED"] = "true";
    process.env["CC_FIRST_RUN_ENV_FILE_PATH"] = defaultEnvFile;
    loadEnvFile(defaultEnvFile);
    return;
  }

  if (existsSync(defaultEnvFile)) {
    loadEnvFile(defaultEnvFile);
    return;
  }

  if (ENV_FILE_REQUIRING_COMMANDS.has(parsedArgs.command)) {
    throw new Error(
      `No CommandsCenter env file found at ${defaultEnvFile}. Start CommandsCenter first with ccenter start, or pass --cc-env-file to an existing env file.`,
    );
  }
}

// Keys handled explicitly below (with computed defaults or special precedence)
// are excluded from the generic CC_* persistence pass.
const EXPLICITLY_HANDLED_ENV_KEYS = new Set([
  "CC_WORKSPACE_DIR",
  "CC_DATA_DIR",
  "CC_SECRET_KEY",
  "CC_HOST",
  "CC_PORT",
]);

function replaceEnvLine(content: string, key: string, value: string): string {
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (!pattern.test(content)) {
    return content;
  }

  // Use a replacer function so `$` in the value is not treated as a
  // replacement pattern (e.g. $&, $1).
  return content.replace(pattern, () => `${key}=${value}`);
}

function createDefaultEnvFile(
  path: string,
  options: { dataDir: string; host?: string; port?: string; workspaceDir: string },
): string {
  mkdirSync(dirname(path), { recursive: true });
  // Honor an operator-provided CC_SECRET_KEY: write it into the generated file so the file and
  // the environment agree and cannot drift on a later start that no longer sets the variable.
  // Fall back to a freshly generated key when none was supplied.
  const providedSecret = process.env["CC_SECRET_KEY"]?.trim();
  const secretKey =
    providedSecret && providedSecret.length > 0 ? providedSecret : randomBytes(32).toString("hex");
  let content = readDefaultProdEnvExample();
  content = replaceEnvLine(content, "CC_WORKSPACE_DIR", options.workspaceDir);
  content = replaceEnvLine(content, "CC_DATA_DIR", options.dataDir);
  content = replaceEnvLine(content, "CC_SECRET_KEY", secretKey);

  if (options.host) {
    content = replaceEnvLine(content, "CC_HOST", options.host);
  }

  if (options.port) {
    content = replaceEnvLine(content, "CC_PORT", options.port);
  }

  // Persist any other CC_* values present in the environment into the generated
  // file, but only for keys the template already documents. The template acts as
  // an allowlist so internal runtime markers (e.g. CC_FIRST_RUN_*) are never written.
  for (const [key, value] of Object.entries(process.env)) {
    if (
      !key.startsWith("CC_") ||
      EXPLICITLY_HANDLED_ENV_KEYS.has(key) ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    content = replaceEnvLine(content, key, value);
  }

  writeFileSync(path, content, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);

  return secretKey;
}

function readDefaultProdEnvExample(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(currentDir, ".env.prod.example"),
    resolve(currentDir, "..", ".env.prod.example"),
    resolve(currentDir, "..", "..", "..", ".env.prod.example"),
  ];

  const match = candidates.find((candidate) => existsSync(candidate));

  if (!match) {
    throw new Error("Unable to find .env.prod.example for first-run configuration generation.");
  }

  return readFileSync(match, "utf8");
}

function warnBeforeCreatingEnvFile(path: string): void {
  console.warn(
    `\x1b[33mWarning: ${path} does not exist. Creating it from .env.prod.example before starting CommandsCenter.\x1b[0m`,
  );
}

export function resolveStaticAssetsDir(): string | undefined {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const publicDir = resolve(currentDir, "public");

  if (existsSync(publicDir)) {
    return publicDir;
  }

  return undefined;
}
