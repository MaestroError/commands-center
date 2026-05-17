import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import fastifyStatic from "@fastify/static";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  createLogger,
  createOwnerAccessService,
  createSystemVersionService,
  loadEnvFile,
  loadRuntimeConfig,
  readPackageInfo,
  startServerRuntime,
} from "@cc/backend";

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
const ENV_FILE_CREATING_COMMANDS = new Set(["start", "serve"]);
const ENV_FILE_REQUIRING_COMMANDS = new Set(["claim", "claim-code"]);

export type CliCommand = "start" | "serve" | "upgrade" | "claim" | "claim-code";

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

  if (!["start", "serve", "upgrade", "claim", "claim-code"].includes(parsedArgs.command)) {
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

  const staticAssetsDir = resolveStaticAssetsDir();

  await startServerRuntime({
    env: process.env,
    overrides: {
      host: parsedArgs.host,
      port: parsedArgs.port,
    },
    register:
      parsedArgs.command === "start"
        ? async (server) => {
            if (!staticAssetsDir || !existsSync(staticAssetsDir)) {
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

async function runClaim(options: { yes: boolean; format: "text" | "json" }): Promise<void> {
  const config = loadRuntimeConfig();
  const service = createOwnerAccessService({ config, logger: createLogger(config) });
  const state = await service.getState();
  const claimed = state.claimedAt !== undefined && state.ownerPassword !== undefined;
  const existingCode = claimed ? state.reclaimCode : state.claimCode;

  if (isActiveClaimCode(existingCode)) {
    const purpose = claimed ? "reclaim" : "claim";
    const confirmed = options.yes || (await confirmClaimCodeRotation(purpose));

    if (!confirmed) {
      console.log("Claim-code generation cancelled.");
      return;
    }
  }

  const result = await service.rotateClaimCode();

  if (options.format === "json") {
    console.log(JSON.stringify(result));
    return;
  }

  console.log(`${result.purpose.toUpperCase()} code: ${result.code}`);
  console.log(result.warning);

  if (claimed) {
    console.log("The current owner password remains valid until reclaim completes.");
  }
}

function isActiveClaimCode(
  code: { invalidatedAt?: string; expiresAt?: string } | undefined,
): boolean {
  if (!code || code.invalidatedAt) {
    return false;
  }

  if (code.expiresAt && new Date(code.expiresAt).getTime() <= Date.now()) {
    return false;
  }

  return true;
}

async function confirmClaimCodeRotation(purpose: "claim" | "reclaim"): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const answer = await rl.question(
      `An active ${purpose} code already exists. Generating a new code removes the old code, and you will have to use the new code to claim this workspace. Continue? [y/N] `,
    );
    return ["y", "yes"].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
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
      process.env["CC_SECRET_KEY"] ??= createDefaultEnvFile(parsedArgs.envFile, {
        host: parsedArgs.host ?? process.env["CC_HOST"],
        port: parsedArgs.port?.toString() ?? process.env["CC_PORT"],
        workspaceDir:
          process.env["CC_WORKSPACE_DIR"] ?? resolve(dirname(parsedArgs.envFile), "workspace"),
      });
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
    process.env["CC_SECRET_KEY"] ??= createDefaultEnvFile(defaultEnvFile, {
      host: parsedArgs.host ?? process.env["CC_HOST"],
      port: parsedArgs.port?.toString() ?? process.env["CC_PORT"],
      workspaceDir: process.env["CC_WORKSPACE_DIR"] ?? resolve(homedir(), ".cc", "workspace"),
    });
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

function createDefaultEnvFile(
  path: string,
  options: { host?: string; port?: string; workspaceDir: string },
): string {
  mkdirSync(dirname(path), { recursive: true });
  const secretKey = randomBytes(32).toString("hex");
  let content = readDefaultProdEnvExample()
    .replace(/^CC_WORKSPACE_DIR=.*$/m, `CC_WORKSPACE_DIR=${options.workspaceDir}`)
    .replace(/^CC_SECRET_KEY=.*$/m, `CC_SECRET_KEY=${secretKey}`);

  if (options.host) {
    content = content.replace(/^CC_HOST=.*$/m, `CC_HOST=${options.host}`);
  }

  if (options.port) {
    content = content.replace(/^CC_PORT=.*$/m, `CC_PORT=${options.port}`);
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
