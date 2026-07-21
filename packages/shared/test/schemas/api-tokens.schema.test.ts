import { describe, expect, it } from "vitest";

import {
  apiTokenActivityEntrySchema,
  apiTokenAuditSettingsSchema,
  apiTokenPermissionsSchema,
  createApiTokenInputSchema,
  updateApiTokenInputSchema,
} from "../../src/schemas/api-tokens.js";

describe("api token permission inputs", () => {
  it("apiTokenPermissionsSchema defaults arrays and document access", () => {
    expect(apiTokenPermissionsSchema.parse({})).toEqual({
      capabilities: [],
      templates: [],
      documents: { global: false, globalFolderPaths: [], privateSpecialistIds: [] },
    });
  });

  it("defaults missing global folder paths", () => {
    expect(
      apiTokenPermissionsSchema.parse({
        documents: { global: false, privateSpecialistIds: [] },
      }).documents.globalFolderPaths,
    ).toEqual([]);
  });

  it("accepts global folder grants up to five levels deep", () => {
    expect(
      apiTokenPermissionsSchema.parse({
        documents: {
          global: false,
          globalFolderPaths: ["one/two/three/four/five"],
          privateSpecialistIds: [],
        },
      }).documents.globalFolderPaths,
    ).toEqual(["one/two/three/four/five"]);
  });

  it("rejects global folder grants deeper than five levels", () => {
    expect(
      apiTokenPermissionsSchema.safeParse({
        documents: {
          global: false,
          globalFolderPaths: ["one/two/three/four/five/six"],
          privateSpecialistIds: [],
        },
      }).success,
    ).toBe(false);
  });

  it.each([
    "/absolute",
    "C:/absolute",
    "folder\\child",
    "folder/../child",
    "folder/.hidden",
    "folder//child",
    "folder/",
  ])("rejects invalid global folder grant path %s", (path) => {
    expect(
      apiTokenPermissionsSchema.safeParse({
        documents: {
          global: false,
          globalFolderPaths: [path],
          privateSpecialistIds: [],
        },
      }).success,
    ).toBe(false);
  });

  it("createApiTokenInputSchema requires at least one capability or template", () => {
    expect(
      createApiTokenInputSchema.safeParse({
        name: "T",
        permissions: { capabilities: [], templates: [] },
      }).success,
    ).toBe(false);
    expect(
      createApiTokenInputSchema.safeParse({
        name: "T",
        permissions: { capabilities: ["create_task"], templates: [] },
      }).success,
    ).toBe(true);
    // A template-only token is valid too.
    expect(
      createApiTokenInputSchema.safeParse({
        name: "T",
        permissions: { capabilities: [], templates: ["tmpl-1"] },
      }).success,
    ).toBe(true);
  });

  it("updateApiTokenInputSchema enforces the same non-empty rule", () => {
    expect(
      updateApiTokenInputSchema.safeParse({ permissions: { capabilities: [], templates: [] } })
        .success,
    ).toBe(false);
    expect(
      updateApiTokenInputSchema.safeParse({
        permissions: { capabilities: ["list_tasks"], templates: [] },
      }).success,
    ).toBe(true);
  });
});

describe("api token audit schemas", () => {
  it("retention setting defaults to 4 and clamps to 1..20", () => {
    expect(apiTokenAuditSettingsSchema.parse({})).toEqual({ retentionWeeks: 4 });
    expect(apiTokenAuditSettingsSchema.safeParse({ retentionWeeks: 0 }).success).toBe(false);
    expect(apiTokenAuditSettingsSchema.safeParse({ retentionWeeks: 21 }).success).toBe(false);
  });

  it("activity entry parses with optional/nullable fields", () => {
    const entry = apiTokenActivityEntrySchema.parse({
      id: "act-1",
      tokenId: "tok-1",
      tokenName: "Automation",
      surface: "rest",
      action: "GET /api/public/v1/tasks",
      capabilityId: null,
      targetKind: null,
      targetId: null,
      outcome: "ok",
      statusCode: 200,
      errorMessage: null,
      createdAt: 1780000000000,
    });
    expect(entry.surface).toBe("rest");
    expect(entry.inputSummary).toBeUndefined();
  });
});
