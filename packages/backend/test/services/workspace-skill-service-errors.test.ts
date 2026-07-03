import { mkdir } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { ConflictError, NotFoundError } from "../../src/lib/api-error";
import { createWorkspaceSkillService } from "../../src/services/workspace-skill-service";
import { createTestDatabase } from "../helpers/db";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) {
    await disposers.pop()?.();
  }
});

async function setup() {
  const testDb = await createTestDatabase();
  disposers.push(() => testDb.cleanup());
  await mkdir(testDb.config.paths.subdirectories.skills, { recursive: true });
  const service = createWorkspaceSkillService({ config: testDb.config });
  return { testDb, service };
}

function entry(relativePath: string, text: string) {
  const contentBase64 = Buffer.from(text, "utf8").toString("base64");
  return {
    name: relativePath.split("/").pop() ?? relativePath,
    relativePath,
    contentBase64,
    sizeBytes: Buffer.byteLength(text, "utf8"),
  };
}

describe("workspace-skill-service errors", () => {
  it("creates, gets, and deletes a workspace skill", async () => {
    const { service } = await setup();
    const created = await service.create({
      name: "My Skill",
      description: "Does something useful for the workspace.",
      category: "custom",
    });
    expect(created.overwritten).toBe(false);
    const slug = created.skill.slug;

    const fetched = await service.get(slug);
    expect(fetched.slug).toBe(slug);

    const recategorized = await service.updateCategory(slug, { category: "analysis" });
    expect(recategorized.skill.slug).toBe(slug);

    await service.delete(slug);
    await expect(service.get(slug)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("raises NotFound for get/delete of an unknown skill", async () => {
    const { service } = await setup();
    await expect(service.get("ghost")).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.delete("ghost")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("raises Conflict when creating a skill that already exists", async () => {
    const { service } = await setup();
    await service.create({ name: "Duplicate", description: "First copy of the skill." });
    await expect(
      service.create({ name: "Duplicate", description: "Second copy of the skill." }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects uploads without exactly one top-level skill folder", async () => {
    const { service } = await setup();

    // A bare top-level file (no skill folder) is rejected.
    await expect(
      service.upload({
        entries: [entry("SKILL.md", "# root")],
        overwrite: false,
      }),
    ).rejects.toThrow();

    // More than one top-level folder is a conflict.
    await expect(
      service.upload({
        entries: [entry("one/SKILL.md", "# one"), entry("two/SKILL.md", "# two")],
        overwrite: false,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
