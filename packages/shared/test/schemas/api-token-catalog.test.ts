import { describe, expect, it } from "vitest";

import {
  API_TOKEN_CAPABILITIES,
  API_TOKEN_CAPABILITY_GROUPS,
  API_TOKEN_PRESETS,
  isApiTokenCapabilityId,
  orderApiTokenCapabilityIds,
} from "../../src/schemas/api-token-catalog.js";

describe("api token catalog", () => {
  it("has unique ids that all belong to a known group", () => {
    const ids = new Set<string>();
    for (const capability of API_TOKEN_CAPABILITIES) {
      expect(ids.has(capability.id)).toBe(false);
      ids.add(capability.id);
      expect(API_TOKEN_CAPABILITY_GROUPS).toContain(capability.group);
    }
  });

  it("presets reference only real capability ids", () => {
    for (const group of API_TOKEN_CAPABILITY_GROUPS) {
      for (const id of API_TOKEN_PRESETS[group]) {
        expect(isApiTokenCapabilityId(id)).toBe(true);
      }
    }
    // The tasks preset includes the template-list capability (old `either`).
    expect(API_TOKEN_PRESETS.tasks).toContain("list_task_templates");
  });

  it("isApiTokenCapabilityId distinguishes known from unknown ids", () => {
    expect(isApiTokenCapabilityId("create_task")).toBe(true);
    expect(isApiTokenCapabilityId("not_a_capability")).toBe(false);
  });

  it("orderApiTokenCapabilityIds dedupes, drops unknowns, and sorts by catalog order", () => {
    const ordered = orderApiTokenCapabilityIds([
      "get_task_run",
      "list_task_templates",
      "list_task_templates",
      "bogus",
    ]);
    expect(ordered).toEqual(["list_task_templates", "get_task_run"]);
    expect(orderApiTokenCapabilityIds([])).toEqual([]);
  });
});
