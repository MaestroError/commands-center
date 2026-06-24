import { describe, expect, it } from "vitest";

import { normalizeSpecialistFilePath } from "../../../src/mcp/cc-managed/groups/cc-default/tools/show-file-to-user";

describe("normalizeSpecialistFilePath", () => {
  const options = {
    specialistSlug: "testing-agent",
    workspaceDir: "/Users/revazgh/cc-dev/.cc/workspace",
    specialistsDir: "/Users/revazgh/cc-dev/.cc/workspace/specialists",
  };

  it("keeps specialist-relative paths unchanged", () => {
    expect(normalizeSpecialistFilePath({ ...options, path: "mermaid.png" })).toBe("mermaid.png");
  });

  it("converts workspace-relative specialist paths to specialist-relative paths", () => {
    expect(
      normalizeSpecialistFilePath({
        ...options,
        path: "specialists/testing-agent/reports/mermaid.png",
      }),
    ).toBe("reports/mermaid.png");
  });

  it("converts absolute paths inside the specialist workspace to specialist-relative paths", () => {
    expect(
      normalizeSpecialistFilePath({
        ...options,
        path: "/Users/revazgh/cc-dev/.cc/workspace/specialists/testing-agent/mermaid.png",
      }),
    ).toBe("mermaid.png");
  });

  it("rejects absolute paths outside the specialist workspace", () => {
    expect(() =>
      normalizeSpecialistFilePath({
        ...options,
        path: "/Users/revazgh/cc-dev/.cc/workspace/specialists/other-agent/secret.md",
      }),
    ).toThrow("Absolute paths must point inside this specialist workspace.");
  });
});
