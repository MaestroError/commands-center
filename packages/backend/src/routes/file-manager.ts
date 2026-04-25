import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  fileManagerCreateEntryInputSchema,
  fileManagerCreateEntryResponseSchema,
  fileManagerDeleteEntryQuerySchema,
  fileManagerListQuerySchema,
  fileManagerListResponseSchema,
  fileManagerRenameEntryInputSchema,
  fileManagerRenameEntryResponseSchema,
} from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import {
  createFileManagerService,
  resolveFileManagerRoot,
} from "../services/file-manager-service.js";

export function registerFileManagerRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const fileManagerService = createFileManagerService({ config: context.config });

  app.get(
    "/api/file-manager/nodes",
    {
      schema: {
        querystring: fileManagerListQuerySchema,
        response: {
          200: fileManagerListResponseSchema,
        },
      },
    },
    async (request) => {
      const root = resolveFileManagerRoot({
        kind: request.query.root,
        config: context.config,
      });

      return fileManagerService.listDirectory(root, request.query);
    },
  );

  app.post(
    "/api/file-manager/entries",
    {
      schema: {
        body: fileManagerCreateEntryInputSchema,
        response: {
          201: fileManagerCreateEntryResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const root = resolveFileManagerRoot({
        kind: request.body.root,
        config: context.config,
      });
      const path = await fileManagerService.createEntry(root, request.body);

      reply.code(201);
      return { path };
    },
  );

  app.patch(
    "/api/file-manager/entries",
    {
      schema: {
        body: fileManagerRenameEntryInputSchema,
        response: {
          200: fileManagerRenameEntryResponseSchema,
        },
      },
    },
    async (request) => {
      const root = resolveFileManagerRoot({
        kind: request.body.root,
        config: context.config,
      });
      const path = await fileManagerService.renameEntry(root, request.body);

      return { path };
    },
  );

  app.delete(
    "/api/file-manager/entries",
    {
      schema: {
        querystring: fileManagerDeleteEntryQuerySchema,
      },
    },
    async (request, reply) => {
      const root = resolveFileManagerRoot({
        kind: request.query.root,
        config: context.config,
      });

      await fileManagerService.deleteEntry(root, request.query);
      reply.code(204);
      return null;
    },
  );
}
