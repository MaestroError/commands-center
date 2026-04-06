import Fastify, { type FastifyServerOptions } from "fastify";

const devTransport: FastifyServerOptions["logger"] = {
  transport: {
    target: "pino-pretty",
    options: { translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
  },
};

export async function createServer() {
  const isDev = process.env["NODE_ENV"] !== "production";

  const server = Fastify({
    logger: isDev ? devTransport : true,
  });

  server.get("/api/health", () => {
    return { status: "ok" };
  });

  return server;
}
