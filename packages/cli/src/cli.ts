import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import fastifyStatic from "@fastify/static";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  createLogger,
  createSystemVersionService,
  loadRuntimeConfig,
  readPackageInfo,
  startServerRuntime,
} from "@cc/backend";
import { loadEnvFile } from "./env-file.js";

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";

export type CliCommand = "start" | "serve" | "upgrade";

export type CliArgs = {
  command: string;
  host?: string;
  port?: number;
  here: boolean;
  envFile?: string;
  help: boolean;
  version: boolean;
  rollback: boolean;
};

export function printHelp(): void {
  console.log(`
  ccenter — CommandsCenter CLI

  Usage:
    ccenter start [options]    Start the server with web UI
    ccenter serve [options]    Start the API server only (no frontend)
    ccenter upgrade [options]  Upgrade the global/local package
    ccenter --help             Show this help
    ccenter --version          Show version

  Options:
    --port, -p <number>        Port to listen on (default: ${String(DEFAULT_PORT)})
    --host, -h <string>        Host to bind to (default: ${DEFAULT_HOST})
    --here                     Store CC workspace in <cwd>/.cc/workspace
    --env-file <path>          Load environment variables from a file
    --rollback                 Reinstall the previous recorded version
`);
}

export function parseCliArgs(args: string[]): CliArgs {
  const command = args[0] ?? "start";
  let port: number | undefined;
  let host: string | undefined;
  let envFile: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if ((arg === "--port" || arg === "-p") && next) {
      port = Number.parseInt(next, 10);
      i++;
      continue;
    }

    if (arg === "--env-file" && next) {
      envFile = next;
      i++;
      continue;
    }

    if ((arg === "--host" || arg === "-h") && next) {
      host = next;
      i++;
    }
  }

  return {
    command,
    host,
    port,
    here: args.includes("--here"),
    envFile,
    help: args.includes("--help"),
    version: args.includes("--version"),
    rollback: args.includes("--rollback"),
  };
}

export async function runCli(args: string[]): Promise<void> {
  const parsedArgs = parseCliArgs(args);

  if (parsedArgs.envFile) {
    loadEnvFile(parsedArgs.envFile);
  } else {
    const defaultEnvFile = resolve(process.env["INIT_CWD"] ?? process.cwd(), ".env");

    if (existsSync(defaultEnvFile)) {
      loadEnvFile(defaultEnvFile);
    }
  }

  process.env["NODE_ENV"] ??= "production";

  if (parsedArgs.help) {
    printHelp();
    return;
  }

  if (parsedArgs.version) {
    console.log(readPackageInfo().version);
    return;
  }

  if (!["start", "serve", "upgrade"].includes(parsedArgs.command)) {
    console.error(`Unknown command: ${parsedArgs.command}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (parsedArgs.here) {
    const root = process.env["INIT_CWD"] ?? process.cwd();
    process.env["CC_WORKSPACE_DIR"] = resolve(root, ".cc", "workspace");
  }

  if (parsedArgs.command === "upgrade") {
    await runUpgrade(parsedArgs.rollback);
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

export function resolveStaticAssetsDir(): string | undefined {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const publicDir = resolve(currentDir, "public");

  if (existsSync(publicDir)) {
    return publicDir;
  }

  return undefined;
}
