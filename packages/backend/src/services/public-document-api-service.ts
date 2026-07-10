import { Buffer } from "node:buffer";

import { and, eq, inArray } from "drizzle-orm";

import {
  publicDocumentListInputSchema,
  publicDocumentReadInputSchema,
  publicDocumentSearchInputSchema,
  type ApiTokenRecord,
  type DocumentListItem,
  type DocumentScope,
  type PublicDocumentListInput,
  type PublicDocumentListResponse,
  type PublicDocumentRead,
  type PublicDocumentReadInput,
  type PublicDocumentSearchExcerpt,
  type PublicDocumentSearchInput,
  type PublicDocumentSearchResponse,
  type PublicDocumentSummary,
} from "@cc/shared/schemas";

import type { AppDb } from "../db/client.js";
import { agents } from "../db/schema/index.js";
import { ApiError, NotFoundError } from "../lib/api-error.js";
import type { DocumentService } from "./document-service.js";

const ROOT_PAGE_SIZE = 200;
const MAX_CONTENT_SEARCH_DOCUMENTS = 500;
const MAX_CONTENT_SEARCH_BYTES = 20 * 1024 * 1024;
const MAX_EXCERPT_CHARACTERS = 300;

type AuthorizedRoot = {
  scope: DocumentScope;
  ownerSlug: string | null;
  ownerSpecialistId: string | null;
};

export type PublicDocumentApiService = ReturnType<typeof createPublicDocumentApiService>;

export function createPublicDocumentApiService(deps: {
  db: AppDb;
  documentService: DocumentService;
}) {
  function resolveRoots(
    token: ApiTokenRecord,
    filters?: { scope?: DocumentScope; ownerSlug?: string },
  ): AuthorizedRoot[] {
    const roots: AuthorizedRoot[] = [];

    if (token.permissions.documents.global && filters?.scope !== "private" && !filters?.ownerSlug) {
      roots.push({ scope: "global", ownerSlug: null, ownerSpecialistId: null });
    }

    const privateIds = token.permissions.documents.privateSpecialistIds;
    if (privateIds.length > 0 && filters?.scope !== "global") {
      const rows = deps.db
        .select({ id: agents.id, slug: agents.slug })
        .from(agents)
        .where(and(inArray(agents.id, privateIds), eq(agents.status, "active")))
        .all()
        .filter((row) => !filters?.ownerSlug || row.slug === filters.ownerSlug)
        .sort((left, right) => left.slug.localeCompare(right.slug));

      roots.push(
        ...rows.map((row) => ({
          scope: "private" as const,
          ownerSlug: row.slug,
          ownerSpecialistId: row.id,
        })),
      );
    }

    return roots;
  }

  async function listRoot(root: AuthorizedRoot): Promise<DocumentListItem[]> {
    const documents: DocumentListItem[] = [];
    let offset = 0;

    while (true) {
      const page = await deps.documentService.list({
        scope: root.scope,
        ownerSpecialistId: root.ownerSpecialistId,
        filter: { limit: ROOT_PAGE_SIZE, offset },
      });
      documents.push(...page.documents);
      if (page.nextOffset === null || page.nextOffset === undefined) {
        return documents;
      }
      offset = page.nextOffset;
    }
  }

  async function listAuthorizedDocuments(
    token: ApiTokenRecord,
    filters?: { scope?: DocumentScope; ownerSlug?: string },
  ): Promise<DocumentListItem[]> {
    const roots = resolveRoots(token, filters);
    const documents = (await Promise.all(roots.map(listRoot))).flat();
    return documents.sort(compareDocuments);
  }

  return {
    async listDocuments(
      token: ApiTokenRecord,
      input: PublicDocumentListInput,
    ): Promise<PublicDocumentListResponse> {
      const parsed = publicDocumentListInputSchema.parse(input);
      const query = parsed.query?.toLowerCase();
      const matches = (await listAuthorizedDocuments(token, parsed))
        .filter(
          (document) => !query || metadataValues(document).some((value) => value.includes(query)),
        )
        .map(toPublicSummary);

      return page(matches, parsed.offset, parsed.limit);
    },

    async readDocument(
      token: ApiTokenRecord,
      input: PublicDocumentReadInput,
    ): Promise<PublicDocumentRead> {
      const parsed = publicDocumentReadInputSchema.parse(input);
      const root = resolveRoots(token, parsed).find(
        (candidate) => candidate.scope === parsed.scope,
      );
      if (!root) {
        throw new NotFoundError("Document not found.");
      }

      try {
        const document = await deps.documentService.read({
          scope: root.scope,
          ownerSpecialistId: root.ownerSpecialistId,
          relativePath: parsed.path,
        });
        return {
          ...toPublicSummary(document),
          content: document.content,
          revision: document.revision,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
        };
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 404) {
          throw new NotFoundError("Document not found.");
        }
        throw error;
      }
    },

    async searchDocuments(
      token: ApiTokenRecord,
      input: PublicDocumentSearchInput,
    ): Promise<PublicDocumentSearchResponse> {
      const parsed = publicDocumentSearchInputSchema.parse(input);
      const query = parsed.query.toLowerCase();
      const candidates = await listAuthorizedDocuments(token, parsed);
      const matches: Array<PublicDocumentSummary & { matches: PublicDocumentSearchExcerpt[] }> = [];
      let contentDocuments = 0;
      let contentBytes = 0;

      for (const candidate of candidates) {
        const excerpts = metadataExcerpts(candidate, query);
        if (
          parsed.includeContent &&
          contentDocuments < MAX_CONTENT_SEARCH_DOCUMENTS &&
          contentBytes < MAX_CONTENT_SEARCH_BYTES
        ) {
          const content = await readSearchContent(deps.documentService, candidate);
          if (content !== undefined) {
            const size = Buffer.byteLength(content, "utf8");
            if (contentBytes + size <= MAX_CONTENT_SEARCH_BYTES) {
              contentDocuments += 1;
              contentBytes += size;
              excerpts.push(...contentExcerpts(content, query, parsed.maxSnippetsPerDocument));
            }
          }
        }

        if (excerpts.length > 0) {
          matches.push({ ...toPublicSummary(candidate), matches: excerpts });
        }
      }

      return page(matches, parsed.offset, parsed.limit);
    },
  };
}

function toPublicSummary(document: DocumentListItem): PublicDocumentSummary {
  return {
    scope: document.scope,
    ownerSlug: document.ownerSlug,
    relativePath: document.relativePath,
    title: document.title,
    description: document.description,
    author: document.author,
  };
}

function compareDocuments(left: DocumentListItem, right: DocumentListItem): number {
  return (
    left.scope.localeCompare(right.scope) ||
    (left.ownerSlug ?? "").localeCompare(right.ownerSlug ?? "") ||
    left.relativePath.localeCompare(right.relativePath)
  );
}

function metadataValues(document: DocumentListItem): string[] {
  return [
    document.relativePath,
    document.title,
    document.description ?? "",
    document.author ?? "",
  ].map((value) => value.toLowerCase());
}

function metadataExcerpts(
  document: DocumentListItem,
  query: string,
): PublicDocumentSearchExcerpt[] {
  const fields = [
    ["relativePath", document.relativePath],
    ["title", document.title],
    ["description", document.description],
    ["author", document.author],
  ] as const;

  return fields.flatMap(([field, value]) =>
    value?.toLowerCase().includes(query)
      ? [{ kind: "metadata" as const, field, lineNumber: null, excerpt: value }]
      : [],
  );
}

async function readSearchContent(
  service: DocumentService,
  document: DocumentListItem,
): Promise<string | undefined> {
  try {
    const read = await service.read({
      scope: document.scope,
      ownerSpecialistId: document.ownerSpecialistId,
      relativePath: document.relativePath,
    });
    return read.content;
  } catch (error) {
    if (error instanceof ApiError && (error.statusCode === 400 || error.statusCode === 404)) {
      return undefined;
    }
    throw error;
  }
}

function contentExcerpts(
  content: string,
  query: string,
  limit: number,
): PublicDocumentSearchExcerpt[] {
  const excerpts: PublicDocumentSearchExcerpt[] = [];
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length && excerpts.length < limit; index += 1) {
    const line = lines[index] ?? "";
    if (line.toLowerCase().includes(query)) {
      excerpts.push({
        kind: "content",
        field: "content",
        lineNumber: index + 1,
        excerpt: line.trim().slice(0, MAX_EXCERPT_CHARACTERS),
      });
    }
  }

  return excerpts;
}

function page<T>(items: T[], offset: number, limit: number) {
  const documents = items.slice(offset, offset + limit);
  const next = offset + limit;
  return {
    documents,
    totalMatches: items.length,
    nextOffset: next < items.length ? next : null,
  };
}
