import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { searchWorkspaceText } from "../../src/services/workspace-text-search.js";

describe("bundled workspace text search", () => {
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "cc-text-search-"));
    await writeFile(join(directory, "notes.txt"), "first line\ncafé marker-42\nlast line\n");
    for (const name of [".cc", ".git", "node_modules"]) {
      await mkdir(join(directory, name));
      await writeFile(join(directory, name, "excluded.txt"), "excluded-marker");
    }
    await writeFile(join(directory, "many.txt"), "bounded-marker\n".repeat(150));
  });
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("preserves regex matches with UTF-8 byte offsets", async () => {
    expect(await searchWorkspaceText(directory, "marker-[0-9]+")).toEqual([
      {
        path: { text: "notes.txt" },
        lines: { text: "café marker-42\n" },
        line_number: 2,
        absolute_offset: 11,
        submatches: [{ match: { text: "marker-42" }, start: 6, end: 15 }],
      },
    ]);
  });
  it("returns an empty list for no matches", async () => {
    expect(await searchWorkspaceText(directory, "absent-marker")).toEqual([]);
  });
  it("returns an empty list for an empty query", async () => {
    expect(await searchWorkspaceText(directory, "")).toEqual([]);
  });
  it("rejects an invalid regex as a bad request", async () => {
    await expect(searchWorkspaceText(directory, "[")).rejects.toMatchObject({ statusCode: 400 });
  });
  it("excludes runtime and dependency directories", async () => {
    expect(await searchWorkspaceText(directory, "excluded-marker")).toEqual([]);
  });
  it("caps matches at 100 lines", async () => {
    expect(await searchWorkspaceText(directory, "bounded-marker")).toHaveLength(100);
  });
  it("observes changed content immediately", async () => {
    await writeFile(join(directory, "edited.txt"), "before-edit");
    await searchWorkspaceText(directory, "before-edit");
    await writeFile(join(directory, "edited.txt"), "after-edit");
    expect(await searchWorkspaceText(directory, "after-edit")).toHaveLength(1);
  });
  it("does not follow directory symlinks", async () => {
    const outside = await mkdtemp(join(tmpdir(), "cc-search-outside-"));
    try {
      await writeFile(join(outside, "secret.txt"), "symlink-only-marker");
      await symlink(outside, join(directory, "escape"));
      expect(await searchWorkspaceText(directory, "symlink-only-marker")).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
  it("reports a missing search directory", async () => {
    await expect(searchWorkspaceText(join(directory, "missing"), "marker")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
