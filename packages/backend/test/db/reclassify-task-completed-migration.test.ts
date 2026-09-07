import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createActivityService } from "../../src/services/activity-service";
import { createTestDatabase } from "../helpers/db";

let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
let pendingTaskId: string;
let archivedTaskId: string;
let warningId: string;

describe("task-completed info migration", () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    const activityService = createActivityService({ db: testDb.client.db });
    const pendingTask = await activityService.emit({
      kind: "task_completed",
      level: "action_required",
      title: "Pending completion",
    });
    const archivedTask = await activityService.emit({
      kind: "task_completed",
      level: "action_required",
      title: "Archived completion",
    });
    const warning = await activityService.emit({
      kind: "specialist_warning",
      level: "action_required",
      title: "Needs attention",
    });
    await activityService.archive(archivedTask.id);
    pendingTaskId = pendingTask.id;
    archivedTaskId = archivedTask.id;
    warningId = warning.id;

    const migrationSql = await readFile(
      resolve(
        import.meta.dirname,
        "../../src/db/migrations/0040_reclassify_task_completed_info.sql",
      ),
      "utf8",
    );
    testDb.client.db.run(sql.raw(migrationSql));
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it("reclassifies pending task-completed activity", async () => {
    const activityService = createActivityService({ db: testDb.client.db });
    const migrated = (await activityService.list()).find(({ id }) => id === pendingTaskId);

    expect(migrated?.level).toBe("info");
  });

  it("reclassifies archived task-completed activity", async () => {
    const activityService = createActivityService({ db: testDb.client.db });
    const migrated = (await activityService.list({ status: "archived" })).find(
      ({ id }) => id === archivedTaskId,
    );

    expect(migrated?.level).toBe("info");
  });

  it("preserves unrelated action-required activity", async () => {
    const activityService = createActivityService({ db: testDb.client.db });
    const warning = (await activityService.list()).find(({ id }) => id === warningId);

    expect(warning?.level).toBe("action_required");
  });
});
