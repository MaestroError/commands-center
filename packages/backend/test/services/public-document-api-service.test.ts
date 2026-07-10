import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { ApiTokenRecord } from "@cc/shared/schemas";

import { agents } from "../../src/db/schema/index";
import type { AppDb } from "../../src/db/client";
import { createDocumentService } from "../../src/services/document-service";
import { createPublicDocumentApiService } from "../../src/services/public-document-api-service";
import { createTestDatabase } from "../helpers/db";

function token(documentAccess: ApiTokenRecord["permissions"]["documents"]): ApiTokenRecord {
  return {
    id: "token-1",
    name: "Documents",
    tokenPrefix: "cc_docs",
    permissions: {
      capabilities: ["list_documents", "search_documents", "read_document"],
      templates: [],
      documents: documentAccess,
    },
    createdAt: Date.now(),
    lastUsedAt: null,
    revokedAt: null,
  };
}

async function insertAgent(db: AppDb, id: string, slug: string): Promise<void> {
  const timestamp = new Date();
  await db.insert(agents).values({
    id,
    slug,
    name: slug,
    role: "Write",
    instructions: "Write.",
    default_model: "openai/gpt-4.1",
    status: "active",
    capabilities_json: "{}",
    created_at: timestamp,
    updated_at: timestamp,
  });
}

describe("public document API service", () => {
  it("lists only token-authorized roots without owner-only fields", async () => {
    const testDb = await createTestDatabase();
    const documents = createDocumentService({ db: testDb.client.db, config: testDb.config });
    const service = createPublicDocumentApiService({
      db: testDb.client.db,
      documentService: documents,
    });

    try {
      await insertAgent(testDb.client.db, "writer-id", "writer");
      await insertAgent(testDb.client.db, "planner-id", "planner");
      await documents.create({ scope: "global", path: "shared/brief.md", content: "Global" });
      await documents.create({
        scope: "private",
        ownerSpecialistId: "writer-id",
        path: "notes/draft.md",
        content: "Writer",
      });
      await documents.create({
        scope: "private",
        ownerSpecialistId: "planner-id",
        path: "notes/plan.md",
        content: "Planner",
      });

      const result = await service.listDocuments(
        token({ global: true, privateSpecialistIds: ["writer-id"] }),
        {},
      );

      expect(result.documents.map((document) => document.relativePath)).toEqual([
        "shared/brief.md",
        "notes/draft.md",
      ]);
      expect(result.documents[0]).not.toHaveProperty("fullPath");
      expect(result.documents[0]).not.toHaveProperty("ownerSpecialistId");
    } finally {
      await testDb.cleanup();
    }
  });

  it("searches metadata and content with line-numbered excerpts", async () => {
    const testDb = await createTestDatabase();
    const documents = createDocumentService({ db: testDb.client.db, config: testDb.config });
    const service = createPublicDocumentApiService({
      db: testDb.client.db,
      documentService: documents,
    });

    try {
      await documents.create({
        scope: "global",
        path: "release/notes.md",
        title: "Release notes",
        author: "Writer",
        content: "First line\nDeployment is Friday\nLast line",
      });

      const result = await service.searchDocuments(
        token({ global: true, privateSpecialistIds: [] }),
        { query: "deployment" },
      );

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]?.matches).toContainEqual({
        kind: "content",
        field: "content",
        lineNumber: 2,
        excerpt: "Deployment is Friday",
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns not found for unauthorized private reads", async () => {
    const testDb = await createTestDatabase();
    const documents = createDocumentService({ db: testDb.client.db, config: testDb.config });
    const service = createPublicDocumentApiService({
      db: testDb.client.db,
      documentService: documents,
    });

    try {
      await insertAgent(testDb.client.db, "writer-id", "writer");
      await documents.create({
        scope: "private",
        ownerSpecialistId: "writer-id",
        path: "notes/draft.md",
        content: "Secret",
      });

      await expect(
        service.readDocument(token({ global: false, privateSpecialistIds: [] }), {
          scope: "private",
          ownerSlug: "writer",
          path: "notes/draft.md",
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      await testDb.cleanup();
    }
  });

  it("fails closed when a selected specialist is archived", async () => {
    const testDb = await createTestDatabase();
    const documents = createDocumentService({ db: testDb.client.db, config: testDb.config });
    const service = createPublicDocumentApiService({
      db: testDb.client.db,
      documentService: documents,
    });

    try {
      await insertAgent(testDb.client.db, "writer-id", "writer");
      await documents.create({
        scope: "private",
        ownerSpecialistId: "writer-id",
        path: "notes/draft.md",
        content: "Secret",
      });
      await testDb.client.db
        .update(agents)
        .set({ status: "archived", archived_at: new Date() })
        .where(eq(agents.id, "writer-id"));

      const result = await service.listDocuments(
        token({ global: false, privateSpecialistIds: ["writer-id"] }),
        {},
      );
      expect(result.documents).toEqual([]);
    } finally {
      await testDb.cleanup();
    }
  });
});
