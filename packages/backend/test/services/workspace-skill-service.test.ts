import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createWorkspaceSkillService } from "../../src/services/workspace-skill-service";
import { createTestDatabase } from "../helpers/db";

describe("createWorkspaceSkillService", () => {
  it("creates workspace skills and writes a starter SKILL.md", async () => {
    const testDb = await createTestDatabase();
    const service = createWorkspaceSkillService({ config: testDb.config });

    try {
      const created = await service.create({
        name: "Release Planning",
        description: "Plan release work.",
      });

      expect(created.skill.slug).toBe("release-planning");
      await expect(
        readFile(
          join(testDb.config.paths.subdirectories.skills, "release-planning", "SKILL.md"),
          "utf8",
        ),
      ).resolves.toContain("description: Plan release work.");
    } finally {
      await testDb.cleanup();
    }
  });

  it("uploads a single skill folder and validates it before saving", async () => {
    const testDb = await createTestDatabase();
    const service = createWorkspaceSkillService({ config: testDb.config });

    try {
      const uploaded = await service.upload({
        overwrite: false,
        entries: [
          {
            name: "SKILL.md",
            relativePath: "release-planning/SKILL.md",
            contentBase64: Buffer.from(
              [
                "---",
                "name: release-planning",
                "description: Plan release work.",
                "compatibility: opencode",
                "metadata:",
                "  category: workflow",
                "---",
                "",
                "# release-planning",
              ].join("\n"),
              "utf8",
            ).toString("base64"),
            sizeBytes: 128,
          },
        ],
      });

      expect(uploaded.skill.slug).toBe("release-planning");
      await expect(service.list()).resolves.toEqual([
        expect.objectContaining({ slug: "release-planning" }),
      ]);
    } finally {
      await testDb.cleanup();
    }
  });
});
