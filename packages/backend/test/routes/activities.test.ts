import { describe, expect, it, vi } from "vitest";

import { createActivityService } from "../../src/services/activity-service";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createLogger } from "../../src/lib/logger";
import { createSecretService } from "../../src/services/secret-service";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

async function setup() {
  const testDb = await createTestDatabase();
  const restart = vi.fn(() => Promise.resolve());
  const secretService = createSecretService({ db: testDb.client.db, config: testDb.config });
  const server = createServer({
    config: testDb.config,
    logger: createLogger(testDb.config),
    database: testDb.client,
    orchestrator: { restart } as unknown as OpenCodeOrchestrator,
    opencodeService: {} as OpenCodeService,
    openCodeEventService: { subscribe: () => {} },
    secretService,
    apiTokenService: createApiTokenService({ db: testDb.client.db }),
    scheduler: { getStatus: () => ({ state: "inactive", healthy: true, driver: "none" }) },
  } as never);

  const activityService = createActivityService({ db: testDb.client.db });
  return { testDb, server, activityService, secretService, restart };
}

describe("activity routes", () => {
  it("lists pending activities with the action-required count", async () => {
    const { testDb, server, activityService } = await setup();
    try {
      await activityService.emit({
        kind: "task_run_failed",
        level: "action_required",
        title: "Run failed",
      });
      await activityService.emit({ kind: "feedback_resolved", level: "info", title: "Feedback" });

      const response = await server.inject({ method: "GET", url: "/api/activities" });
      expect(response.statusCode).toBe(200);
      const body = response.json<{
        activities: { title: string }[];
        actionRequiredCount: number;
      }>();
      expect(body.activities.map((entry) => entry.title)).toEqual(["Run failed", "Feedback"]);
      expect(body.actionRequiredCount).toBe(1);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("archives an activity and drops it from the pending list", async () => {
    const { testDb, server, activityService } = await setup();
    try {
      const activity = await activityService.emit({
        kind: "task_completed",
        level: "action_required",
        title: "Done",
      });

      const archive = await server.inject({
        method: "POST",
        url: `/api/activities/${activity.id}/archive`,
      });
      expect(archive.statusCode).toBe(200);
      expect(archive.json<{ status: string }>().status).toBe("archived");

      const list = await server.inject({ method: "GET", url: "/api/activities" });
      expect(list.json<{ activities: unknown[]; actionRequiredCount: number }>()).toEqual({
        activities: [],
        actionRequiredCount: 0,
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("archives all pending activities", async () => {
    const { testDb, server, activityService } = await setup();
    try {
      await activityService.emit({
        kind: "task_completed",
        level: "action_required",
        title: "Done",
      });
      await activityService.emit({ kind: "feedback_resolved", level: "info", title: "Feedback" });

      const response = await server.inject({ method: "POST", url: "/api/activities/archive-all" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ archivedCount: 2 });
      expect((await server.inject({ method: "GET", url: "/api/activities" })).json()).toMatchObject(
        {
          activities: [],
          actionRequiredCount: 0,
        },
      );
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("unarchives a resolved activity", async () => {
    const { testDb, server, activityService } = await setup();
    try {
      const activity = await activityService.emit({
        kind: "task_completed",
        level: "action_required",
        title: "Done",
      });
      await activityService.archive(activity.id);

      const response = await server.inject({
        method: "POST",
        url: `/api/activities/${activity.id}/unarchive`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        activity: { status: "pending", archivedAt: null },
        archivedActivityIds: [],
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("404s when archiving an unknown activity", async () => {
    const { testDb, server } = await setup();
    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/activities/nope/archive",
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("404s when unarchiving an unknown activity", async () => {
    const { testDb, server } = await setup();
    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/activities/nope/unarchive",
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("fills a secret_request: sets the secret, restarts the engine, archives the card", async () => {
    const { testDb, server, activityService, secretService, restart } = await setup();
    try {
      const activity = await activityService.emit({
        kind: "secret_request",
        level: "action_required",
        title: "Secret needed: GITHUB_TOKEN",
        payload: { secretKey: "GITHUB_TOKEN" },
        dedupeKey: "secret_request:GITHUB_TOKEN",
      });

      const response = await server.inject({
        method: "POST",
        url: `/api/activities/${activity.id}/fill-secret`,
        payload: { value: "ghp_secret" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<{ status: string }>().status).toBe("archived");

      expect(restart).toHaveBeenCalledTimes(1);
      const secrets = await secretService.list();
      expect(secrets.find((secret) => secret.key === "GITHUB_TOKEN")?.isSet).toBe(true);
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects fill-secret on a non-secret_request activity", async () => {
    const { testDb, server, activityService, restart } = await setup();
    try {
      const activity = await activityService.emit({
        kind: "task_completed",
        level: "action_required",
        title: "Done",
      });

      const response = await server.inject({
        method: "POST",
        url: `/api/activities/${activity.id}/fill-secret`,
        payload: { value: "x" },
      });
      expect(response.statusCode).toBe(404);
      expect(restart).not.toHaveBeenCalled();
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});
