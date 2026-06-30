import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  globalSearchQuerySchema,
  globalSearchWorkspaceFilesResponseSchema,
} from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createDocumentService } from "../services/document-service.js";
import { resolveFileManagerRoot } from "../services/file-manager-service.js";

const MAX_SEARCH_RESULTS = 20;

export function registerSearchRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const documentService = createDocumentService({
    db: context.database.db,
    config: context.config,
  });

  app.get(
    "/api/search/files",
    {
      schema: {
        querystring: globalSearchQuerySchema,
        response: {
          200: globalSearchWorkspaceFilesResponseSchema,
        },
      },
    },
    async (request) => {
      const root = resolveFileManagerRoot({ kind: "workspace", config: context.config });
      const query = request.query.query;

      const [nameMatches, contentMatches, documentMatches] = await Promise.all([
        context.opencodeService.findFiles(root.basePath, {
          query,
          type: "file",
          limit: MAX_SEARCH_RESULTS,
        }),
        context.opencodeService.findText(root.basePath, query),
        documentService.search(query),
      ]);

      const visibleNameMatches = nameMatches.filter((path) => !isExcludedSearchPath(path));
      const visibleContentMatches = contentMatches.filter(
        (match) => !isExcludedSearchPath(match.path.text),
      );

      return {
        nameMatches: visibleNameMatches.map((path) => ({ path })),
        contentMatches: visibleContentMatches.map((match) => ({
          path: match.path.text,
          lineNumber: match.line_number,
          lineText: match.lines.text,
        })),
        // Cap documents to keep the response payload bounded, matching the
        // filename-match limit above.
        documentMatches: documentMatches.slice(0, MAX_SEARCH_RESULTS).map((doc) => ({
          relativePath: doc.relativePath,
          fullPath: doc.fullPath,
          title: doc.title,
          description: doc.description,
        })),
      };
    },
  );
}

function isExcludedSearchPath(path: string): boolean {
  return path.split(/[\\/]/).includes("node_modules");
}
