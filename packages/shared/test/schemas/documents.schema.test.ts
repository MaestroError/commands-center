import { describe, expect, it } from "vitest";

import {
  createDocumentFolderInputSchema,
  createDocumentInputSchema,
  documentListResponseSchema,
  documentMetadataSchema,
  documentReadResponseSchema,
  documentTreeNodeSchema,
  documentTreeResponseSchema,
  saveDocumentContentInputSchema,
  searchDocumentsQuerySchema,
  searchDocumentsResponseSchema,
  updateDocumentMetadataInputSchema,
} from "../../src/schemas/documents.js";

describe("document schemas", () => {
  describe("documentMetadataSchema", () => {
    it("accepts valid metadata with all fields", () => {
      expect(
        documentMetadataSchema.parse({
          id: "doc-1",
          relativePath: "notes/design.md",
          title: "Design Notes",
          description: "Overview of system design",
          author: "operator",
          createdAt: 1700000000000,
          updatedAt: 1700000001000,
          lastSeenAt: 1700000001000,
        }),
      ).toEqual({
        id: "doc-1",
        relativePath: "notes/design.md",
        title: "Design Notes",
        description: "Overview of system design",
        author: "operator",
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
        lastSeenAt: 1700000001000,
      });
    });

    it("defaults nullable fields to null", () => {
      const result = documentMetadataSchema.parse({
        id: "doc-2",
        relativePath: "readme.md",
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        lastSeenAt: 1700000000000,
      });

      expect(result.title).toBeNull();
      expect(result.description).toBeNull();
      expect(result.author).toBeNull();
    });

    it("rejects empty id", () => {
      expect(() =>
        documentMetadataSchema.parse({
          id: "",
          relativePath: "file.md",
          createdAt: 0,
          updatedAt: 0,
          lastSeenAt: 0,
        }),
      ).toThrow();
    });
  });

  describe("createDocumentInputSchema", () => {
    it("accepts a minimal valid document creation", () => {
      expect(
        createDocumentInputSchema.parse({
          path: "notes/notes.md",
        }),
      ).toMatchObject({ path: "notes/notes.md" });
    });

    it("accepts creation with all optional fields", () => {
      expect(
        createDocumentInputSchema.parse({
          path: "design/architecture.md",
          title: "Architecture",
          description: "System architecture overview",
          author: "operator",
          content: "# Architecture\n\nOverview here.",
        }),
      ).toEqual({
        path: "design/architecture.md",
        title: "Architecture",
        description: "System architecture overview",
        author: "operator",
        content: "# Architecture\n\nOverview here.",
      });
    });

    it("trims whitespace from path and title", () => {
      const result = createDocumentInputSchema.parse({
        path: "  notes/notes.md  ",
        title: "  My Title  ",
      });

      expect(result.path).toBe("notes/notes.md");
      expect(result.title).toBe("My Title");
    });

    it("accepts .markdown extension", () => {
      expect(createDocumentInputSchema.parse({ path: "docs/doc.markdown" })).toMatchObject({
        path: "docs/doc.markdown",
      });
    });

    it("rejects creating documents directly in the Documents root", () => {
      expect(() => createDocumentInputSchema.parse({ path: "notes.md" })).toThrow(
        "New documents must live in at least one folder under Documents/",
      );
    });

    it("rejects absolute paths", () => {
      expect(() => createDocumentInputSchema.parse({ path: "/etc/notes.md" })).toThrow(
        "Path must be relative",
      );
    });

    it("rejects path traversal", () => {
      expect(() => createDocumentInputSchema.parse({ path: "../outside.md" })).toThrow(
        "Path must not contain ..",
      );
    });

    it("rejects hidden segments", () => {
      expect(() => createDocumentInputSchema.parse({ path: ".hidden/notes.md" })).toThrow(
        "Path must not contain empty or hidden segments",
      );
    });

    it("rejects backslashes anywhere in the path so paths stay portable", () => {
      // A backslash would be a literal filename char on POSIX but a separator
      // on Windows; reject it outright instead of accepting an OS-dependent path.
      expect(() => createDocumentInputSchema.parse({ path: "design\\overview.md" })).toThrow(
        "Path must use '/' separators",
      );
      expect(() => createDocumentInputSchema.parse({ path: "foo\\.hidden\\bar.md" })).toThrow(
        "Path must use '/' separators",
      );
      expect(() => createDocumentInputSchema.parse({ path: "\\notes.md" })).toThrow(
        "Path must use '/' separators",
      );
    });

    it("rejects Windows drive-letter absolute paths", () => {
      expect(() => createDocumentInputSchema.parse({ path: "C:\\notes.md" })).toThrow(
        "Path must be relative",
      );
      expect(() => createDocumentInputSchema.parse({ path: "C:/notes.md" })).toThrow(
        "Path must be relative",
      );
    });

    it("rejects empty segments", () => {
      expect(() => createDocumentInputSchema.parse({ path: "notes//file.md" })).toThrow(
        "Path must not contain empty or hidden segments",
      );
    });

    it("rejects non-markdown extensions", () => {
      expect(() => createDocumentInputSchema.parse({ path: "notes.txt" })).toThrow(
        "Path must end with .md or .markdown",
      );
    });

    it("rejects empty path", () => {
      expect(() => createDocumentInputSchema.parse({ path: "" })).toThrow();
    });
  });

  describe("createDocumentFolderInputSchema", () => {
    it("accepts valid folder path", () => {
      expect(createDocumentFolderInputSchema.parse({ path: "design/specs" })).toEqual({
        path: "design/specs",
      });
    });

    it("rejects absolute paths", () => {
      expect(() => createDocumentFolderInputSchema.parse({ path: "/absolute" })).toThrow(
        "Path must be relative",
      );
    });

    it("rejects Windows drive-letter absolute paths", () => {
      expect(() => createDocumentFolderInputSchema.parse({ path: "C:\\foo" })).toThrow(
        "Path must be relative",
      );
      expect(() => createDocumentFolderInputSchema.parse({ path: "C:/foo" })).toThrow(
        "Path must be relative",
      );
    });

    it("rejects backslashes so folder paths stay portable", () => {
      expect(() => createDocumentFolderInputSchema.parse({ path: "design\\specs" })).toThrow(
        "Path must use '/' separators",
      );
    });

    it("rejects path traversal", () => {
      expect(() => createDocumentFolderInputSchema.parse({ path: "foo/../bar" })).toThrow(
        "Path must not contain ..",
      );
    });

    it("rejects hidden segments", () => {
      expect(() => createDocumentFolderInputSchema.parse({ path: ".hidden" })).toThrow(
        "Path must not contain empty or hidden segments",
      );
    });
  });

  describe("updateDocumentMetadataInputSchema", () => {
    it("accepts metadata update with valid path", () => {
      expect(
        updateDocumentMetadataInputSchema.parse({
          path: "notes.md",
          title: "Updated Title",
          description: "New description",
        }),
      ).toMatchObject({
        path: "notes.md",
        title: "Updated Title",
        description: "New description",
      });
    });

    it("rejects non-markdown path", () => {
      expect(() =>
        updateDocumentMetadataInputSchema.parse({
          path: "notes.txt",
          title: "Title",
        }),
      ).toThrow("Path must end with .md or .markdown");
    });
  });

  describe("saveDocumentContentInputSchema", () => {
    it("accepts save with expected revision", () => {
      const result = saveDocumentContentInputSchema.parse({
        path: "notes.md",
        content: "# Updated Content",
        expectedRevision: {
          mtimeMs: 1700000000000,
          sizeBytes: 100,
        },
      });

      expect(result.path).toBe("notes.md");
      expect(result.content).toBe("# Updated Content");
      expect(result.expectedRevision.mtimeMs).toBe(1700000000000);
    });

    it("accepts revision with optional sha256", () => {
      const result = saveDocumentContentInputSchema.parse({
        path: "notes.md",
        content: "",
        expectedRevision: {
          mtimeMs: 1700000000000,
          sizeBytes: 0,
          sha256: "abc123",
        },
      });

      expect(result.expectedRevision.sha256).toBe("abc123");
    });
  });

  describe("documentTreeNodeSchema", () => {
    it("accepts a file node", () => {
      expect(
        documentTreeNodeSchema.parse({
          name: "notes.md",
          relativePath: "notes.md",
          type: "file",
          title: "My Notes",
        }),
      ).toEqual({
        name: "notes.md",
        relativePath: "notes.md",
        type: "file",
        title: "My Notes",
      });
    });

    it("accepts a directory node with children", () => {
      const tree = documentTreeNodeSchema.parse({
        name: "design",
        relativePath: "design",
        type: "directory",
        title: null,
        children: [
          {
            name: "overview.md",
            relativePath: "design/overview.md",
            type: "file",
            title: "Overview",
          },
        ],
      });

      expect(tree.type).toBe("directory");
      expect(tree.children).toBeDefined();
      expect(tree.children).toHaveLength(1);
      expect(tree.children?.[0]?.name).toBe("overview.md");
    });

    it("defaults title to null", () => {
      const node = documentTreeNodeSchema.parse({
        name: "file.md",
        relativePath: "file.md",
        type: "file",
      });

      expect(node.title).toBeNull();
    });
  });

  describe("response schemas", () => {
    it("parses document list response", () => {
      const response = documentListResponseSchema.parse({
        documents: [
          {
            relativePath: "notes.md",
            fullPath: "/workspace/Documents/notes.md",
            title: "Notes",
            description: null,
            author: null,
          },
        ],
      });

      expect(response.documents).toHaveLength(1);
      expect(response.documents[0]?.title).toBe("Notes");
    });

    it("parses empty document list response", () => {
      expect(documentListResponseSchema.parse({ documents: [] })).toEqual({
        documents: [],
      });
    });

    it("parses document tree response", () => {
      const response = documentTreeResponseSchema.parse({
        tree: [
          {
            name: "docs",
            relativePath: "docs",
            type: "directory",
            title: null,
            children: [],
          },
        ],
      });

      expect(response.tree).toHaveLength(1);
    });

    it("parses document read response", () => {
      const response = documentReadResponseSchema.parse({
        relativePath: "notes.md",
        fullPath: "/workspace/Documents/notes.md",
        title: "Notes",
        description: null,
        author: null,
        content: "# Notes\n\nContent here.",
        revision: { mtimeMs: 1700000000000, sizeBytes: 23 },
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
      });

      expect(response.content).toBe("# Notes\n\nContent here.");
      expect(response.revision.sizeBytes).toBe(23);
    });

    it("parses search documents response", () => {
      const response = searchDocumentsResponseSchema.parse({
        documents: [
          {
            relativePath: "design.md",
            fullPath: "/workspace/Documents/design.md",
            title: "Design",
            description: "System design notes",
            author: "operator",
          },
        ],
      });

      expect(response.documents).toHaveLength(1);
    });
  });

  describe("searchDocumentsQuerySchema", () => {
    it("accepts non-empty query", () => {
      expect(searchDocumentsQuerySchema.parse({ query: "design" })).toEqual({
        query: "design",
      });
    });

    it("trims query whitespace", () => {
      expect(searchDocumentsQuerySchema.parse({ query: "  design  " })).toEqual({
        query: "design",
      });
    });

    it("rejects empty query", () => {
      expect(() => searchDocumentsQuerySchema.parse({ query: "" })).toThrow();
    });

    it("rejects whitespace-only query", () => {
      expect(() => searchDocumentsQuerySchema.parse({ query: "   " })).toThrow();
    });
  });
});
