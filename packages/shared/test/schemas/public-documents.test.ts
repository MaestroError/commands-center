import { describe, expect, it } from "vitest";

import {
  publicDocumentListInputSchema,
  publicDocumentReadInputSchema,
  publicDocumentSearchInputSchema,
  publicDocumentSummarySchema,
} from "../../src/schemas/public-documents.js";

describe("public document schemas", () => {
  it("applies bounded list and search defaults", () => {
    expect(publicDocumentListInputSchema.parse({})).toMatchObject({ limit: 50, offset: 0 });
    expect(publicDocumentSearchInputSchema.parse({ query: "release" })).toMatchObject({
      includeContent: true,
      limit: 50,
      offset: 0,
      maxSnippetsPerDocument: 3,
    });
  });

  it("requires a private owner and forbids a global owner", () => {
    expect(
      publicDocumentReadInputSchema.safeParse({ scope: "private", path: "notes/a.md" }).success,
    ).toBe(false);
    expect(
      publicDocumentReadInputSchema.safeParse({
        scope: "global",
        ownerSlug: "writer",
        path: "notes/a.md",
      }).success,
    ).toBe(false);
  });

  it("public summaries reject owner-only filesystem fields", () => {
    const parsed = publicDocumentSummarySchema.parse({
      scope: "private",
      ownerSlug: "writer",
      relativePath: "notes/a.md",
      title: "A",
      description: null,
      author: null,
      fullPath: "/workspace/specialists/writer/Documents/notes/a.md",
      ownerSpecialistId: "specialist-1",
    });

    expect(parsed).not.toHaveProperty("fullPath");
    expect(parsed).not.toHaveProperty("ownerSpecialistId");
  });
});
