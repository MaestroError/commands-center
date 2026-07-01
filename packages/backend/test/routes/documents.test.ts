import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

async function createRouteServer(testDb: Awaited<ReturnType<typeof createTestDatabase>>) {
  await mkdir(testDb.config.paths.subdirectories.documents, { recursive: true });

  return createServer({
    config: testDb.config,
    logger: createLogger(testDb.config),
    database: testDb.client,
    apiTokenService: createApiTokenService({ db: testDb.client.db }),
    orchestrator: createOrchestrator(),
    opencodeService: createMockOpenCodeService(),
    openCodeEventService: { subscribe: () => {} },
    secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    scheduler: createSchedulerService(),
  });
}

function createOrchestrator(): OpenCodeOrchestrator {
  return {
    getStatus: () => ({
      state: "healthy",
      healthy: true,
      url: "http://localhost:4100",
      workspaceDir: "/test",
      restartCount: 0,
      maxRestarts: 3,
    }),
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
  };
}

function createMockOpenCodeService(): OpenCodeService {
  return {
    dispose: () => {},
    disposeGlobal: () => {},
  } as unknown as OpenCodeService;
}

describe("document routes", () => {
  describe("GET /api/documents/tree", () => {
    it("returns an empty tree for an empty Documents folder", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        const response = await server.inject({ method: "GET", url: "/api/documents/tree" });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ tree: [] });
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });

    it("returns documents and folders in the tree", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        await server.inject({
          method: "POST",
          url: "/api/documents/folders",
          payload: { path: "design" },
        });
        await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: { path: "design/overview.md", title: "Overview" },
        });
        await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: { path: "design/readme.md", title: "Readme" },
        });
        await (
          await import("node:fs/promises")
        ).writeFile(
          join(testDb.config.paths.subdirectories.documents, "readme.md"),
          "# Readme",
          "utf8",
        );

        const response = await server.inject({ method: "GET", url: "/api/documents/tree" });

        expect(response.statusCode).toBe(200);
        const body = response.json<{ tree: Array<{ name: string; type: string }> }>();
        expect(body.tree).toHaveLength(2);
        expect(body.tree[0]?.type).toBe("directory");
        expect(body.tree[0]?.name).toBe("design");
        expect(body.tree[1]?.type).toBe("file");
        expect(body.tree[1]?.name).toBe("readme.md");
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });
  });

  describe("POST /api/documents", () => {
    it("creates a document and returns 201", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: {
            path: "notes/notes.md",
            title: "My Notes",
            description: "Some notes",
            author: "operator",
          },
        });

        expect(response.statusCode).toBe(201);
        const body = response.json<{
          documents: Array<{ relativePath: string; title: string }>;
        }>();
        expect(body.documents).toHaveLength(1);
        expect(body.documents[0]?.title).toBe("My Notes");
        expect(body.documents[0]?.relativePath).toBe("notes/notes.md");
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });

    it("rejects creating documents directly in the Documents root with 400", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: { path: "notes.md" },
        });

        expect(response.statusCode).toBe(400);
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });

    it("rejects invalid paths with 400", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: { path: "../escape.md" },
        });

        expect(response.statusCode).toBe(400);
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });

    it("rejects non-markdown files with 400", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: { path: "notes/notes.txt" },
        });

        expect(response.statusCode).toBe(400);
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });

    it("rejects Windows drive-letter absolute paths with 400", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        for (const path of ["C:\\notes.md", "C:/notes.md"]) {
          const response = await server.inject({
            method: "POST",
            url: "/api/documents",
            payload: { path },
          });
          expect(response.statusCode).toBe(400);
        }
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });

    it("returns 409 for duplicate documents", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: { path: "notes/notes.md" },
        });

        const response = await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: { path: "notes/notes.md" },
        });

        expect(response.statusCode).toBe(409);
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });
  });

  describe("POST /api/documents/folders", () => {
    it("creates a folder and returns 201", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/documents/folders",
          payload: { path: "design/specs" },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({ path: "design/specs" });
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });
  });

  describe("GET /api/documents/file", () => {
    it("reads a document with content and metadata", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: {
            path: "notes/notes.md",
            title: "Notes",
            content: "# Hello\n\nWorld",
          },
        });

        const response = await server.inject({
          method: "GET",
          url: "/api/documents/file?path=notes%2Fnotes.md",
        });

        expect(response.statusCode).toBe(200);
        const body = response.json<{
          relativePath: string;
          title: string;
          content: string;
          revision: { mtimeMs: number; sizeBytes: number };
        }>();
        expect(body.relativePath).toBe("notes/notes.md");
        expect(body.title).toBe("Notes");
        expect(body.content).toBe("# Hello\n\nWorld");
        expect(body.revision.sizeBytes).toBeGreaterThan(0);
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });

    it("returns 404 for missing documents", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        const response = await server.inject({
          method: "GET",
          url: "/api/documents/file?path=missing.md",
        });

        expect(response.statusCode).toBe(404);
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });
  });

  describe("GET /api/documents/asset", () => {
    it("serves a workspace file with its content type", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        const { writeFile } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        await writeFile(join(testDb.config.paths.subdirectories.documents, "logo.png"), pngBytes);

        const response = await server.inject({
          method: "GET",
          url: "/api/documents/asset?path=Documents/logo.png",
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("image/png");
        expect(response.rawPayload.equals(pngBytes)).toBe(true);
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });

    it("accepts the workspace: scheme prefix", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        const { writeFile } = await import("node:fs/promises");
        const { join } = await import("node:path");
        await writeFile(
          join(testDb.config.paths.subdirectories.documents, "logo.png"),
          Buffer.from([0x89]),
        );

        const response = await server.inject({
          method: "GET",
          url: `/api/documents/asset?path=${encodeURIComponent("workspace:Documents/logo.png")}`,
        });

        expect(response.statusCode).toBe(200);
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });

    it("returns 404 for a missing asset", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        const response = await server.inject({
          method: "GET",
          url: "/api/documents/asset?path=Documents/missing.png",
        });

        expect(response.statusCode).toBe(404);
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });

    it("rejects path traversal outside the workspace", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        const response = await server.inject({
          method: "GET",
          url: `/api/documents/asset?path=${encodeURIComponent("../../../etc/hosts")}`,
        });

        expect(response.statusCode).toBe(400);
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });
  });

  describe("GET /api/documents/search", () => {
    it("searches documents by title", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: { path: "architecture/arch.md", title: "Architecture Overview" },
        });
        await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: { path: "notes/notes.md", title: "Meeting Notes" },
        });

        const response = await server.inject({
          method: "GET",
          url: "/api/documents/search?query=architecture",
        });

        expect(response.statusCode).toBe(200);
        const body = response.json<{
          documents: Array<{ title: string }>;
        }>();
        expect(body.documents).toHaveLength(1);
        expect(body.documents[0]?.title).toBe("Architecture Overview");
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });

    it("returns 400 for empty query", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        const response = await server.inject({
          method: "GET",
          url: "/api/documents/search?query=",
        });

        expect(response.statusCode).toBe(400);
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });
  });

  describe("PATCH /api/documents/metadata", () => {
    it("updates document metadata", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: { path: "notes/notes.md", title: "Old Title" },
        });

        const response = await server.inject({
          method: "PATCH",
          url: "/api/documents/metadata",
          payload: {
            path: "notes/notes.md",
            title: "New Title",
            description: "Updated description",
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json<{ title: string; description: string }>();
        expect(body.title).toBe("New Title");
        expect(body.description).toBe("Updated description");
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });

    it("returns 404 for metadata update on missing document", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        const response = await server.inject({
          method: "PATCH",
          url: "/api/documents/metadata",
          payload: { path: "missing.md", title: "Title" },
        });

        expect(response.statusCode).toBe(404);
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });
  });

  describe("PUT /api/documents/content", () => {
    it("saves content and returns updated revision", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: { path: "notes/notes.md", content: "original" },
        });

        const readResponse = await server.inject({
          method: "GET",
          url: "/api/documents/file?path=notes%2Fnotes.md",
        });
        const { revision } = readResponse.json<{
          revision: { mtimeMs: number; sizeBytes: number };
        }>();

        const saveResponse = await server.inject({
          method: "PUT",
          url: "/api/documents/content",
          payload: {
            path: "notes/notes.md",
            content: "updated content",
            expectedRevision: revision,
          },
        });

        expect(saveResponse.statusCode).toBe(200);
        const body = saveResponse.json<{
          revision: { mtimeMs: number; sizeBytes: number };
        }>();
        expect(body.revision.sizeBytes).toBe(15);
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });

    it("returns 409 on revision conflict", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: { path: "notes/notes.md", content: "original" },
        });

        const response = await server.inject({
          method: "PUT",
          url: "/api/documents/content",
          payload: {
            path: "notes/notes.md",
            content: "changed",
            expectedRevision: { mtimeMs: 0, sizeBytes: 0 },
          },
        });

        expect(response.statusCode).toBe(409);
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });
  });

  describe("content is never in list/search responses", () => {
    it("tree response does not contain content field", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: { path: "notes/notes.md", content: "secret content" },
        });

        const response = await server.inject({ method: "GET", url: "/api/documents/tree" });
        const raw = JSON.stringify(response.json());
        expect(raw).not.toContain("secret content");
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });

    it("search response does not include a content field", async () => {
      const testDb = await createTestDatabase();
      const server = await createRouteServer(testDb);

      try {
        await server.inject({
          method: "POST",
          url: "/api/documents",
          payload: {
            path: "notes/notes.md",
            title: "Notes",
            description: "Short summary",
            content: "# Notes\n\nLong body that should not appear in search.",
          },
        });

        const response = await server.inject({
          method: "GET",
          url: "/api/documents/search?query=notes",
        });
        const body = response.json<{ documents: Array<Record<string, unknown>> }>();
        expect(body.documents).toHaveLength(1);
        expect(body.documents[0]).not.toHaveProperty("content");
      } finally {
        await server.close();
        await testDb.cleanup();
      }
    });
  });
});
