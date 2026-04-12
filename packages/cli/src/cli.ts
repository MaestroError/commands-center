import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import fastifyStatic from "@fastify/static";
import type { FastifyReply, FastifyRequest } from "fastify";

import { startServerRuntime } from "@cc/backend";

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";

export type CliCommand = "start" | "serve";

export type CliArgs = {
  command: string;
  host?: string;
  port?: number;
  here: boolean;
  help: boolean;
  version: boolean;
};

export function printHelp(): void {
  console.log(`
  ccenter — CommandsCenter CLI

  Usage:
    ccenter start [options]    Start the server with web UI
    ccenter serve [options]    Start the API server only (no frontend)
    ccenter --help             Show this help
    ccenter --version          Show version

  Options:
    --port, -p <number>        Port to listen on (default: ${String(DEFAULT_PORT)})
    --host, -h <string>        Host to bind to (default: ${DEFAULT_HOST})
    --here                     Store CC workspace in <cwd>/.cc/workspace
`);
}

export function parseCliArgs(args: string[]): CliArgs {
  const command = args[0] ?? "start";
  let port: number | undefined;
  let host: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if ((arg === "--port" || arg === "-p") && next) {
      port = Number.parseInt(next, 10);
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
    help: args.includes("--help"),
    version: args.includes("--version"),
  };
}

export async function runCli(args: string[]): Promise<void> {
  process.env["NODE_ENV"] ??= "production";

  const parsedArgs = parseCliArgs(args);

  if (parsedArgs.help) {
    printHelp();
    return;
  }

  if (parsedArgs.version) {
    console.log("0.0.0");
    return;
  }

  if (parsedArgs.command !== "start" && parsedArgs.command !== "serve") {
    console.error(`Unknown command: ${parsedArgs.command}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (parsedArgs.here) {
    const root = process.env["INIT_CWD"] ?? process.cwd();
    process.env["CC_WORKSPACE_DIR"] = resolve(root, ".cc", "workspace");
  }

  const staticAssetsDir = resolveStaticAssetsDir();

  await startServerRuntime({
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

export function resolveStaticAssetsDir(): string | undefined {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const publicDir = resolve(currentDir, "public");

  if (existsSync(publicDir)) {
    return publicDir;
  }

  return undefined;
}
