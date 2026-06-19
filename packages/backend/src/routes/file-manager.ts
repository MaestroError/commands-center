import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  fileManagerCreateEntryInputSchema,
  fileManagerCreateEntryResponseSchema,
  fileManagerDirectorySearchQuerySchema,
  fileManagerDirectorySearchResponseSchema,
  fileManagerDeleteEntryQuerySchema,
  fileManagerFileContentQuerySchema,
  fileManagerFileContentResponseSchema,
  fileManagerListQuerySchema,
  fileManagerListResponseSchema,
  fileManagerMoveEntryInputSchema,
  fileManagerMoveEntryResponseSchema,
  fileManagerPreferencesSchema,
  fileManagerRenameEntryInputSchema,
  fileManagerRenameEntryResponseSchema,
  fileManagerSaveFileInputSchema,
  fileManagerSaveFileResponseSchema,
  fileManagerUploadInputSchema,
  fileManagerUploadResponseSchema,
  fileManagerUpdatePreferencesInputSchema,
} from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import {
  createFileManagerService,
  resolveFileManagerRoot,
} from "../services/file-manager-service.js";
import { createFileManagerPreferencesService } from "../services/file-manager-preferences-service.js";

export function registerFileManagerRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const fileManagerService = createFileManagerService({ config: context.config });
  const preferencesService = createFileManagerPreferencesService({ config: context.config });

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
    "/api/file-manager/uploads",
    {
      bodyLimit: 75 * 1024 * 1024,
      schema: {
        body: fileManagerUploadInputSchema,
        response: {
          200: fileManagerUploadResponseSchema,
        },
      },
    },
    async (request) => {
      const root = resolveFileManagerRoot({
        kind: request.body.root,
        config: context.config,
      });
      const preferences = await preferencesService.get();

      return fileManagerService.uploadEntries(root, request.body, {
        allowHostFilesystemEdits: preferences.allowHostFilesystemEdits,
        maxUploadSizeBytes: preferences.fileUploads.maxUploadSizeBytes,
        allowDangerousFiles: preferences.fileUploads.allowDangerousFiles,
      });
    },
  );

  app.get(
    "/api/file-manager/directories",
    {
      schema: {
        querystring: fileManagerDirectorySearchQuerySchema,
        response: {
          200: fileManagerDirectorySearchResponseSchema,
        },
      },
    },
    async (request) => {
      const root = resolveFileManagerRoot({
        kind: request.query.root,
        config: context.config,
      });

      const directories = await fileManagerService.searchDirectories(root, {
        query: request.query.query,
        excludePath: request.query.excludePath,
        limit: request.query.limit,
      });

      return { directories };
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

  app.post(
    "/api/file-manager/entries/move",
    {
      schema: {
        body: fileManagerMoveEntryInputSchema,
        response: {
          200: fileManagerMoveEntryResponseSchema,
        },
      },
    },
    async (request) => {
      const root = resolveFileManagerRoot({
        kind: request.body.root,
        config: context.config,
      });
      const path = await fileManagerService.moveEntry(root, request.body);

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

  app.get(
    "/api/file-manager/files/content",
    {
      schema: {
        querystring: fileManagerFileContentQuerySchema,
        response: {
          200: fileManagerFileContentResponseSchema,
        },
      },
    },
    async (request) => {
      const root = resolveFileManagerRoot({
        kind: request.query.root,
        config: context.config,
      });
      const preferences = await preferencesService.get();

      return fileManagerService.readFileContent(root, request.query.path, {
        allowHostFilesystemEdits: preferences.allowHostFilesystemEdits,
      });
    },
  );

  app.put(
    "/api/file-manager/files/content",
    {
      schema: {
        body: fileManagerSaveFileInputSchema,
        response: {
          200: fileManagerSaveFileResponseSchema,
        },
      },
    },
    async (request) => {
      const root = resolveFileManagerRoot({
        kind: request.body.root,
        config: context.config,
      });
      const preferences = await preferencesService.get();

      return fileManagerService.writeFileContent(root, request.body, {
        allowHostFilesystemEdits: preferences.allowHostFilesystemEdits,
      });
    },
  );

  app.get(
    "/api/file-manager/preferences",
    {
      schema: {
        response: {
          200: fileManagerPreferencesSchema,
        },
      },
    },
    async () => preferencesService.get(),
  );

  app.put(
    "/api/file-manager/preferences",
    {
      schema: {
        body: fileManagerUpdatePreferencesInputSchema,
        response: {
          200: fileManagerPreferencesSchema,
        },
      },
    },
    async (request) => preferencesService.update(request.body),
  );
}
