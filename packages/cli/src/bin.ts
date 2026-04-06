import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import type { FastifyRequest, FastifyReply } from "fastify";
import { createServer } from "@cc/backend";
import fastifyStatic from "@fastify/static";

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";

process.env["NODE_ENV"] ??= "production";

function printHelp(): void {
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
`);
}

function parseArgs(args: string[]): {
  command: string;
  port: number;
  host: string;
} {
  const command = args[0] ?? "start";
  let port = DEFAULT_PORT;
  let host = DEFAULT_HOST;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if ((arg === "--port" || arg === "-p") && next) {
      port = Number.parseInt(next, 10);
      i++;
    } else if ((arg === "--host" || arg === "-h") && next) {
      host = next;
      i++;
    }
  }

  return { command, port, host };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    printHelp();
    return;
  }

  if (args.includes("--version")) {
    console.log("0.0.0");
    return;
  }

  const { command, port, host } = parseArgs(args);

  if (command !== "start" && command !== "serve") {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  const server = await createServer();

  if (command === "start") {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const publicDir = resolve(currentDir, "public");

    if (existsSync(publicDir)) {
      await server.register(fastifyStatic, {
        root: publicDir,
        wildcard: false,
      });

      server.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
        return reply.sendFile("index.html");
      });
    }
  }

  await server.listen({ port, host });

  const mode = command === "serve" ? "API-only" : "full";
  console.log(`ccenter (${mode}) running at http://${host}:${String(port)}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
