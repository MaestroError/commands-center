import { z } from "zod";
import {
  activityListResponseSchema,
  activitySchema,
  archiveAllActivitiesResponseSchema,
} from "@cc/shared/schemas";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createActivityService } from "../services/activity-service.js";

const listQuerySchema = z.object({
  status: z.enum(["pending", "archived", "all"]).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

export function registerActivityRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service =
    context.activityService ??
    createActivityService({ db: context.database.db, logger: context.logger });

  app.get(
    "/api/activities",
    {
      schema: {
        querystring: listQuerySchema,
        response: { 200: activityListResponseSchema },
      },
    },
    async (request) => {
      const [activities, actionRequiredCount] = await Promise.all([
        service.list({ status: request.query.status }),
        service.actionRequiredCount(),
      ]);
      return { activities, actionRequiredCount };
    },
  );

  app.post(
    "/api/activities/archive-all",
    {
      schema: { response: { 200: archiveAllActivitiesResponseSchema } },
    },
    async () => ({ archivedCount: await service.archiveAllPending() }),
  );

  app.post(
    "/api/activities/:id/archive",
    {
      schema: {
        params: idParamsSchema,
        response: { 200: activitySchema },
      },
    },
    async (request) => service.archive(request.params.id),
  );

  // Resolve a secret_request: store the value, restart the engine so it takes
  // effect, then archive the card. Safe to restart here — no agent turn is
  // blocked on this (the request was non-blocking).
  app.post(
    "/api/activities/:id/fill-secret",
    {
      schema: {
        params: idParamsSchema,
        body: z.object({ value: z.string().min(1) }),
        response: { 200: activitySchema },
      },
    },
    async (request) => {
      const activity = await service.get(request.params.id);
      if (!activity || activity.kind !== "secret_request" || activity.status !== "pending") {
        throw new NotFoundError("Secret request not found.");
      }
      const secretKey =
        typeof activity.payload["secretKey"] === "string"
          ? activity.payload["secretKey"]
          : undefined;
      if (!secretKey) {
        throw new BadRequestError("Secret request is missing its key.");
      }
      if (!context.secretService) {
        throw new BadRequestError("Secret service is unavailable.");
      }

      await context.secretService.set(secretKey, request.body.value);
      void context.orchestrator?.restart("secret updated");
      return service.archive(activity.id);
    },
  );
}
