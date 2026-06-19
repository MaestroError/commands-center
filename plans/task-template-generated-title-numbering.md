# Task Template Generated Title Numbering Plan

## Assumptions To Confirm

- Generated task titles should be suffixed when a task is created from a task template, e.g. `Write post #M17`.
- The number should be based on existing generated tasks linked to the template, then plus one.
- Count should use the task-template relationship, not title matching.
- Count should include all non-deleted generated tasks for that template, including archived/done tasks, so numbers do not reset when tasks leave the active board.
- Existing trigger sources are `manual`, `scheduled`, `api`, `template`, and `system`. There is no persisted `ai` trigger source today. Current agent/MCP template runs use the generic `template` source.
- Both MCP task-template surfaces receive the calling specialist slug. `cc_default` self-template tools already resolve it to an agent id; `cc_tasks_management` tools also receive `agentSlug` and can resolve it before generating a task.
- Capturing which specialist generated a task should be task-level, not only run-level, because `create_self_task_from_template` can create a task without queueing a run.

## Proposed Source Letters

| Creation path                                                 | Current code path       | Proposed suffix letter |
| ------------------------------------------------------------- | ----------------------- | ---------------------- |
| User clicks Create task / Run now from template UI            | Internal task routes    | `M`                    |
| Public API triggers/schedules template                        | Public API service      | `A`                    |
| Recurring scheduler generates from template                   | Scheduler service       | `S`                    |
| Specialist/agent MCP tool creates/runs template               | MCP task-template tools | `G`                    |
| Internal/system-generated template task, if any later appears | System source           | `Y`                    |

Open decision: if you specifically want AI-generated tasks to show `I` or `AI` semantics, I would add an explicit `agent` or `ai` trigger source to the shared schema. Since the requested format has one character, I recommend `G` for agent-generated to avoid colliding with `A` for API.

## Generated-By Specialist Capture

Add a nullable task-level field for template-generated task provenance:

- DB column: `tasks.generated_by_agent_id` nullable FK to `agents.id`.
- Shared schema/API field: `generatedByAgentId?: string`.
- Service input: `createTaskFromTemplate(..., { generatedByAgentId })`.
- MCP template generation paths pass the calling specialist id:
  - `cc_default` self tools: `run_self_task_template_now`, `create_self_task_from_template`.
  - `cc_tasks_management` tools: `run_task_template_now`.
- Non-specialist paths leave it unset:
  - UI manual create/run: no specialist id.
  - Public API: no specialist id unless a future API token ownership model provides one.
  - Scheduler: no specialist id.

This keeps the generated task's assigned specialist (`agentId` / `defaultAgentId`) separate from the specialist who caused generation (`generatedByAgentId`). That distinction matters for `cc_tasks_management`, where one specialist may generate a task from a template assigned to another specialist.

## Implementation Tasks

1. Confirm trigger-source taxonomy
   - Decide whether agent-created template tasks should become a new persisted trigger source (`agent`) or continue as `template` with route-level mapping.
   - Verify all template generation entry points are covered: UI create task, UI run now, public API trigger/schedule, recurring scheduler, managed MCP tools, self MCP tools.

2. Add generated-by specialist persistence
   - Add `generated_by_agent_id` to the Drizzle task schema.
   - Generate a Drizzle migration and metadata with `pnpm --filter @cc/backend db:generate`.
   - Expose `generatedByAgentId` in the shared task schema and backend task mapper.
   - Preserve null for existing/generated-by-unknown tasks.

3. Add title suffix helper in task service
   - Add a small helper near `createTaskFromTemplate` that maps trigger source to one-character code.
   - Add a task-count helper that counts generated tasks linked by `source_template_id = template.id`, plus the legacy/current `template_id = template.id AND id != template.id` relationship used by `listTemplateTasks`.
   - Build `title` as `${template.title} #${letter}${count + 1}`.

4. Update generation entry points to pass exact creation source and specialist provenance
   - Internal UI Create task / Run now should pass `manual` instead of generic `template`.
   - Public API already passes `api`.
   - Scheduler should pass `scheduled` for scheduled template generation.
   - MCP tools should pass the chosen agent/AI source from task 1.
   - MCP tools should resolve `context.agentSlug` to an agent id and pass it as `generatedByAgentId`.
   - Keep direct task queueing behavior unchanged unless it is part of template generation.

5. Preserve duplicate-occurrence idempotency
   - Keep the existing check that returns an existing generated task for the same `source_template_id + source_occurrence_at`.
   - Ensure the count/title is only computed for a new row, not when returning an existing generated task.
   - Ensure generated-by provenance is not overwritten when the duplicate path returns an existing task.

6. Add focused tests
   - Service test: first generated task gets `#M1` or the chosen source letter.
   - Service test: existing linked generated tasks produce the next number.
   - Service test: existing duplicate occurrence returns the original title without incrementing.
   - Service test: `generatedByAgentId` is mapped on generated tasks when provided.
   - Route/API tests: UI path uses manual letter, public API uses API letter, scheduler uses scheduled letter, MCP/agent path uses the confirmed agent letter.
   - MCP tests: `cc_default` and `cc_tasks_management` template generation persist the calling specialist as `generatedByAgentId`.

7. Run required verification
   - Run `pnpm eslint --fix`.
   - Run relevant backend/shared tests for task schemas, task service, task scheduler, routes, public API, and MCP coverage.
   - If changes touch shared schema for a new source, also run shared schema tests.

## Files Expected To Change

- `packages/shared/src/schemas/tasks.ts`
- `packages/shared/test/schemas/tasks.schema.test.ts` only if adding a new trigger source
- `packages/backend/src/db/schema/tasks.ts`
- `packages/backend/src/db/migrations/*`
- `packages/backend/src/db/migrations/meta/*`
- `packages/backend/src/services/task-service.ts`
- `packages/backend/src/routes/tasks.ts`
- `packages/backend/src/services/task-scheduler-service.ts`
- `packages/backend/src/mcp/cc-managed/groups/cc-default/tools/self-task-template-tools.ts`
- `packages/backend/src/mcp/cc-managed/groups/cc-tasks-management/tools/task-management-tools.ts`
- Relevant backend tests under `packages/backend/test/`

## Migration Expected

A database migration is now expected because generated-by specialist provenance should live on the generated task row. This is SQLite runtime state, not portable workspace configuration, so it does not affect task-template portability. The migration should be generated through Drizzle rather than written by hand.
