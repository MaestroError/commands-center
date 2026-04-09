import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import type { FastifyInstance } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Logger } from "pino";

export type AppServer = FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse<IncomingMessage>,
  Logger
>;

export type AppTypeProvider = ZodTypeProvider;

export function configureFastifyZod(server: AppServer): void {
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
}
