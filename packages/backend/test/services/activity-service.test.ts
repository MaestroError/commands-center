import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createActivityService, type ActivityService } from "../../src/services/activity-service";
import { createTestDatabase } from "../helpers/db";

let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
let service: ActivityService;

beforeEach(async () => {
  testDb = await createTestDatabase();
  service = createActivityService({ db: testDb.client.db });
});

afterEach(async () => {
  await testDb.cleanup();
});

describe("activity service", () => {
  it("emits a pending activity with parsed payload", async () => {
    const activity = await service.emit({
      kind: "task_run_failed",
      level: "action_required",
      title: "Run failed",
      body: "boom",
      payload: { taskId: "t1", taskRunId: "r1" },
    });

    expect(activity.status).toBe("pending");
    expect(activity.title).toBe("Run failed");
    expect(activity.payload).toEqual({ taskId: "t1", taskRunId: "r1" });

    const list = await service.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(activity.id);
  });

  it("collapses re-emits with the same dedupeKey instead of duplicating", async () => {
    const first = await service.emit({
      kind: "task_completed",
      level: "action_required",
      title: "Done v1",
      dedupeKey: "task_completed:r1",
    });
    const second = await service.emit({
      kind: "task_completed",
      level: "action_required",
      title: "Done v2",
      dedupeKey: "task_completed:r1",
    });

    expect(second.id).toBe(first.id);
    const list = await service.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("Done v2");
  });

  it("lists pending newest-last and supports status=all and status=archived", async () => {
    const a = await service.emit({ kind: "task_completed", level: "info", title: "A" });
    const b = await service.emit({ kind: "task_completed", level: "info", title: "B" });
    await service.archive(a.id);

    const pending = await service.list();
    expect(pending.map((entry) => entry.id)).toEqual([b.id]);

    const archived = await service.list({ status: "archived" });
    expect(archived.map((entry) => entry.id)).toEqual([a.id]);

    const all = await service.list({ status: "all" });
    expect(all.map((entry) => entry.id)).toEqual([a.id, b.id]);
  });

  it("counts only pending action-required activities", async () => {
    await service.emit({ kind: "task_run_failed", level: "action_required", title: "fail" });
    await service.emit({ kind: "feedback_resolved", level: "info", title: "info" });
    const resolved = await service.emit({
      kind: "task_needs_review",
      level: "action_required",
      title: "review",
    });

    expect(await service.actionRequiredCount()).toBe(2);
    await service.archive(resolved.id);
    expect(await service.actionRequiredCount()).toBe(1);
  });

  it("archive is idempotent and rejects unknown ids", async () => {
    const activity = await service.emit({
      kind: "secret_request",
      level: "action_required",
      title: "Fill secret",
    });

    const archived = await service.archive(activity.id);
    expect(archived.status).toBe("archived");
    expect(archived.archivedAt).not.toBeNull();

    const again = await service.archive(activity.id);
    expect(again.status).toBe("archived");

    await expect(service.archive("nope")).rejects.toThrow(/not found/i);
  });

  it("archives all pending activities by dedupeKey", async () => {
    await service.emit({
      kind: "task_run_approval",
      level: "action_required",
      title: "Approve",
      dedupeKey: "approval:req1",
    });
    await service.archiveByDedupeKey("approval:req1");

    expect(await service.list()).toHaveLength(0);
    expect(await service.actionRequiredCount()).toBe(0);
  });
});
