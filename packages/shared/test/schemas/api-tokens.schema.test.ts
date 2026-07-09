import { describe, expect, it } from "vitest";

import {
  apiTokenActivityEntrySchema,
  apiTokenAuditSettingsSchema,
  apiTokenPermissionsSchema,
  createApiTokenInputSchema,
  updateApiTokenInputSchema,
} from "../../src/schemas/api-tokens.js";

describe("api token permission inputs", () => {
  it("apiTokenPermissionsSchema defaults both arrays", () => {
    expect(apiTokenPermissionsSchema.parse({})).toEqual({ capabilities: [], templates: [] });
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
