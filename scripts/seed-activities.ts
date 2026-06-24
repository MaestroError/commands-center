/**
 * Seed dummy activities so the Dashboard activity thread + nav bell can be tested
 * end to end. Writes to the same SQLite DB the dev server reads, so a running app
 * picks them up on its next poll (~20s) or a refresh.
 *
 *   pnpm seed-activities          # seed one of each kind
 *   pnpm seed-activities --clear  # archive existing pending activities first
 *
 * The `secret_request` card is fully functional (its key is registered as unset,
 * so "Fill secret" sets it and restarts the engine). Task cards link to a real
 * task when one exists in the DB (so "Open task" works); otherwise they use a
 * placeholder id and only "Mark read" is meaningful.
 */
import { loadDefaultEnvFile } from "../packages/backend/src/lib/env-file.js";
import { loadRuntimeConfig } from "../packages/backend/src/lib/runtime-config.js";
import { createDatabaseClient } from "../packages/backend/src/db/client.js";
import { migrateDatabase } from "../packages/backend/src/db/migrate.js";
import { createActivityService } from "../packages/backend/src/services/activity-service.js";
import { createSecretService } from "../packages/backend/src/services/secret-service.js";

loadDefaultEnvFile();
const config = loadRuntimeConfig({ cwd: process.cwd(), env: process.env });
const client = createDatabaseClient(config);
migrateDatabase(client.db);

const activityService = createActivityService({ db: client.db });
const secretService = createSecretService({ db: client.db, config });

const args = process.argv.slice(2);
const clear = args.includes("--clear");

try {
  if (clear) {
    const pending = await activityService.list();
    for (const activity of pending) {
      await activityService.archive(activity.id);
    }
    console.log(`Archived ${String(pending.length)} existing pending activities.`);
  }

  // Link task cards to a real task when one exists, so "Open task" works.
  const task = await client.db.query.tasks.findFirst();
  const taskId = task?.id ?? "seed-task-1";
  if (task) {
    console.log(`Linking task activities to existing task: ${taskId}`);
  } else {
    console.log('No tasks found — task cards will use a placeholder id ("Open task" will 404).');
  }

  const SECRET_KEY = "DEMO_API_KEY";
  await secretService.ensure([SECRET_KEY]);

  await activityService.emit({
    kind: "secret_request",
    level: "action_required",
    title: `Secret needed: ${SECRET_KEY}`,
    body: "A specialist needs this credential to call the demo provider.",
    payload: { secretKey: SECRET_KEY },
    dedupeKey: `secret_request:${SECRET_KEY}`,
  });

  await activityService.emit({
    kind: "task_completed",
    level: "action_required",
    title: "Task completed: Weekly report",
    body: "## Summary\n\nGenerated the weekly report with **3 sections** and saved it to `report.md`.",
    payload: { taskId, taskRunId: "seed-run-completed" },
    dedupeKey: "seed:task_completed",
  });

  await activityService.emit({
    kind: "task_needs_review",
    level: "action_required",
    title: "Task needs review: Pricing update",
    body: "Confirm the new totals before publishing — I was not sure about the tax rounding.",
    payload: { taskId, taskRunId: "seed-run-review" },
    dedupeKey: "seed:task_needs_review",
  });

  await activityService.emit({
    kind: "feedback_resolved",
    level: "info",
    title: "Feedback resolved: Onboarding doc",
    body: "Addressed your feedback and updated the onboarding steps.",
    payload: {
      taskId,
      taskRunId: "seed-run-feedback-ok",
      subtaskId: "seed-subtask-1",
      feedbackId: "seed-feedback-1",
    },
    dedupeKey: "seed:feedback_resolved",
  });

  await activityService.emit({
    kind: "subtask_needs_review",
    level: "action_required",
    title: "Feedback needs review: Onboarding doc",
    body: "I made the change but need you to confirm the tone of the intro paragraph.",
    payload: {
      taskId,
      taskRunId: "seed-run-feedback-review",
      subtaskId: "seed-subtask-2",
      feedbackId: "seed-feedback-2",
    },
    dedupeKey: "seed:subtask_needs_review",
  });

  await activityService.emit({
    kind: "task_run_failed",
    level: "action_required",
    title: "Task run failed: Nightly sync",
    body: "Error: provider request timed out after 30s.",
    payload: { taskId, taskRunId: "seed-run-failed" },
    dedupeKey: "seed:task_run_failed",
  });

  const all = await activityService.list();
  console.log(`Seeded activities. ${String(all.length)} pending now.`);
} finally {
  client.close();
}
