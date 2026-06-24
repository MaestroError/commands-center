import { describe, expect, it } from "vitest";

import { createRequestSecretDefinition } from "../../../src/mcp/cc-managed/groups/cc-default/tools/request-secret";
import { createActivityService } from "../../../src/services/activity-service";
import { createSecretService } from "../../../src/services/secret-service";
import { createTestDatabase } from "../../helpers/db";

describe("request_secret tool", () => {
  it("registers an unset secret and emits a secret_request without blocking", async () => {
    const testDb = await createTestDatabase();
    try {
      const secretService = createSecretService({ db: testDb.client.db, config: testDb.config });
      const activityService = createActivityService({ db: testDb.client.db });
      const definition = createRequestSecretDefinition({ secretService, activityService });

      const result = await definition.execute(
        { key: "GITHUB_TOKEN", reason: "needed for the integration" },
        { agentSlug: "ada" },
      );
      expect(result.isError).toBeFalsy();

      const secrets = await secretService.list();
      expect(secrets.find((secret) => secret.key === "GITHUB_TOKEN")?.isSet).toBe(false);

      const activities = await activityService.list();
      expect(activities).toHaveLength(1);
      expect(activities[0]).toMatchObject({
        kind: "secret_request",
        level: "action_required",
        payload: { secretKey: "GITHUB_TOKEN" },
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("collapses repeat requests for the same key", async () => {
    const testDb = await createTestDatabase();
    try {
      const secretService = createSecretService({ db: testDb.client.db, config: testDb.config });
      const activityService = createActivityService({ db: testDb.client.db });
      const definition = createRequestSecretDefinition({ secretService, activityService });

      await definition.execute({ key: "OPENAI_API_KEY" }, { agentSlug: "ada" });
      await definition.execute({ key: "OPENAI_API_KEY" }, { agentSlug: "ada" });

      expect(await activityService.list()).toHaveLength(1);
    } finally {
      await testDb.cleanup();
    }
  });
});
