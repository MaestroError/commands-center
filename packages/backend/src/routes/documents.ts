import { createReadStream } from "node:fs";

import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  createDocumentFolderInputSchema,
  createDocumentInputSchema,
  documentScopeSchema,
  documentFolderListingResponseSchema,
  documentListResponseSchema,
  documentReadResponseSchema,
  documentTreeResponseSchema,
  saveDocumentContentInputSchema,
  saveDocumentContentResponseSchema,
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
    async () => ({
      tree: await service.getTree({ scope: "global" }),
      privateTrees: await service.getPrivateTreeGroups(),
    }),
  );

  app.get(
    "/api/documents/folder",
    {
      schema: {
        querystring: documentFolderListQuerySchema,
        response: { 200: documentFolderListingResponseSchema },
      },
    },
    async (request) =>
      service.listFolder({
        scope: request.query["scope"],
        ownerSlug: request.query["owner"],
        path: request.query["path"],
      }),
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
    async (request) =>
      service.read({
        scope: request.query["scope"],
        ownerSlug: request.query["owner"],
        relativePath: request.query["path"],
      }),
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
      return { documents: [doc], totalMatches: 1, nextOffset: null };
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
      await service.createFolder(request.body);
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
        response: { 200: saveDocumentContentResponseSchema },
      },
    },
    async (request) => service.saveContent(request.body),
  );
}

import { z } from "zod";

const documentReadQuerySchema = z
  .object({
    scope: documentScopeSchema.default("global"),
    owner: z.string().trim().min(1).optional(),
    path: z.string().min(1),
  })
  .superRefine((input, context) => {
    if (input.scope === "private" && !input.owner) {
      context.addIssue({
        code: "custom",
        path: ["owner"],
        message: "Private documents require an owner",
      });
    }

    if (input.scope === "global" && input.owner) {
      context.addIssue({
        code: "custom",
        path: ["owner"],
        message: "Global documents must not specify an owner",
      });
    }
  });

const documentFolderListQuerySchema = z
  .object({
    scope: documentScopeSchema.default("global"),
    owner: z.string().trim().min(1).optional(),
    // Empty/omitted path lists the scope root.
    path: z.string().default(""),
  })
  .superRefine((input, context) => {
    if (input.scope === "private" && !input.owner) {
      context.addIssue({
        code: "custom",
        path: ["owner"],
        message: "Private documents require an owner",
      });
    }

    if (input.scope === "global" && input.owner) {
      context.addIssue({
        code: "custom",
        path: ["owner"],
        message: "Global documents must not specify an owner",
      });
    }
  });

const documentAssetQuerySchema = z.object({
  path: z.string().min(1),
});
