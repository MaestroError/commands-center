import { createReadStream } from "node:fs";

import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  createDocumentFolderInputSchema,
  createDocumentInputSchema,
  documentListResponseSchema,
  documentReadResponseSchema,
  documentTreeResponseSchema,
  saveDocumentContentInputSchema,
  searchDocumentsQuerySchema,
  searchDocumentsResponseSchema,
  updateDocumentMetadataInputSchema,
} from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createDocumentService } from "../services/document-service.js";

export function registerDocumentRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = createDocumentService({
    db: context.database.db,
    config: context.config,
  });

  app.get(
    "/api/documents/tree",
    {
      schema: {
        response: { 200: documentTreeResponseSchema },
      },
    },
    async () => ({ tree: await service.getTree() }),
  );

  app.get(
    "/api/documents/search",
    {
      schema: {
        querystring: searchDocumentsQuerySchema,
        response: { 200: searchDocumentsResponseSchema },
      },
    },
    async (request) => ({ documents: await service.search(request.query.query) }),
  );

  app.get(
    "/api/documents/file",
    {
      schema: {
        querystring: documentReadQuerySchema,
        response: { 200: documentReadResponseSchema },
      },
    },
    async (request) => service.read(request.query.path),
  );

  app.get(
    "/api/documents/asset",
    {
      schema: {
        querystring: documentAssetQuerySchema,
      },
    },
    async (request, reply) => {
      const asset = await service.resolveWorkspaceAsset(request.query.path);
      void reply.header("Cache-Control", "private, no-cache");
      void reply.type(asset.contentType);
      return reply.send(createReadStream(asset.absolutePath));
    },
  );

  app.post(
    "/api/documents",
    {
      schema: {
        body: createDocumentInputSchema,
        response: { 201: documentListResponseSchema },
      },
    },
    async (request, reply) => {
      const doc = await service.create(request.body);
      void reply.status(201);
      return { documents: [doc] };
    },
  );

  app.post(
    "/api/documents/folders",
    {
      schema: {
        body: createDocumentFolderInputSchema,
      },
    },
    async (request, reply) => {
      await service.createFolder(request.body.path);
      void reply.status(201);
      return { path: request.body.path };
    },
  );

  app.patch(
    "/api/documents/metadata",
    {
      schema: {
        body: updateDocumentMetadataInputSchema,
      },
    },
    async (request) => service.updateMetadata(request.body),
  );

  app.put(
    "/api/documents/content",
    {
      schema: {
        body: saveDocumentContentInputSchema,
      },
    },
    async (request) => service.saveContent(request.body),
  );
}

import { z } from "zod";

const documentReadQuerySchema = z.object({
  path: z.string().min(1),
});

const documentAssetQuerySchema = z.object({
  path: z.string().min(1),
});
