# cc_default Self Tools Plan

## Goal

Give every specialist a safe self-service tool surface through `cc_default`: a specialist can create, schedule, inspect, and review its own tasks without gaining the broad cross-specialist powers of `cc_tasks_management`.

Conversation history tools are intentionally out of scope for this plan:

- `list_self_conversations`
- `get_self_conversation`
- `search_self_history`

Before adding history search, investigate whether OpenCode exposes a session-history search API. If it does, prefer using that API over implementing a separate CommandsCenter search index.

## Implementation Status

- Phase 1 (self task reads + direct self task creation): **done**.
- Phase 3 (explicit-ID self context tools): **done**.
- Phases 2, 4, 5, 6: not started.

All Phase 1/3 tools live in `cc_default` in
`packages/backend/src/mcp/cc-managed/groups/cc-default/tools/self-task-tools.ts`.

Timeout decisions (agreed for the live-draft work in Phase 2):

- `cc_default` carries an explicit 15s tool-call timeout (`toolCallTimeoutMs`) so a
  hung quick call fails fast. The registry now supports a per-group
  `toolCallTimeoutMs`; `interactive: true` still implies the long live-request
  window when no explicit timeout is set.
- Phase 2 self draft tools should go in a new `cc_default_interactive` group
  (`enabledByDefault: true`, `interactive: true`, `toolCallTimeoutMs` of 10 min),
  not on `cc_default`, so the default quick-tool timeout stays tight. The empty
  group was intentionally not created yet — add it together with the Phase 2 tools.

## Principles

- Scope every self tool from the MCP route/token calling specialist. Do not accept arbitrary `agentId` or `specialistId` in `cc_default` self tools.
- Keep broad administrative task operations in `cc_tasks_management`.
- Keep self tools in `cc_default` because every specialist should have them by default.
- Use existing task and live-request services where possible.
- Prefer explicit `self_` tool names so the model understands the safety boundary.
- Return structured content for automation and concise text content for model readability.

## Phase 1: Self Task Read and Direct Task Creation

### Tools

| Tool                  | Context    | Purpose                                           |
| --------------------- | ---------- | ------------------------------------------------- |
| `create_self_task`    | `task_run` | Create a task assigned to the calling specialist. |
| `schedule_self_task`  | `both`     | Schedule an existing self-owned task.             |
| `queue_self_task`     | `both`     | Queue an existing self-owned task.                |
| `list_self_tasks`     | `both`     | List tasks assigned to the calling specialist.    |
| `get_self_task`       | `both`     | Read one task assigned to the calling specialist. |
| `list_self_task_runs` | `both`     | List runs for a self-owned task.                  |
| `get_self_task_run`   | `both`     | Read one run for a self-owned task.               |

### Tool Contracts

`create_self_task`

- Input: same useful subset as `create_task`, except no `agentId`.
- Context: `task_run` only.
- Behavior: resolves calling specialist id from `context.agentSlug`, then calls `taskService.create({ ...input, agentId })`.
- Guardrails: reject any attempt to pass an agent/specialist id.

`schedule_self_task`

- Input: `{ taskId, scheduledAt, dueAt? }`.
- Context: `both`.
- Behavior: load task, verify `task.agentId === callingAgentId`, then update status/schedule.

`queue_self_task`

- Input: `{ taskId, metadata? }`.
- Context: `both`.
- Behavior: load task, verify `task.agentId === callingAgentId`, then call `taskExecutionService.queue(taskId, { triggerSource: "manual", metadata })`.

`list_self_tasks`

- Input: `listTasksQuerySchema.partial()` minus `agentId`, plus optional `limit`.
- Context: `both`.
- Behavior: call `taskService.list({ ...query, agentId: callingAgentId })`.
- Limit: start with existing service behavior; add capped limit only if the service supports it cleanly.

`get_self_task`

- Input: `{ taskId }`.
- Context: `both`.
- Behavior: load task and require self ownership.

`list_self_task_runs`

- Input: `{ taskId, query? }`.
- Context: `both`.
- Behavior: require self-owned task, then call `taskService.listRuns(taskId, query)`.

`get_self_task_run`

- Input: `{ taskId, runId }`.
- Context: `both`.
- Behavior: require self-owned task, then call `taskService.getRun(taskId, runId)`.

### Implementation Path

- Add `packages/backend/src/mcp/cc-managed/groups/cc-default/tools/self-task-tools.ts`.
- Reuse schemas from `@cc/shared/schemas` where possible.
- Add helper functions in the new file:
  - `requireCallingAgentId(db, agentSlug)`
  - `requireSelfTask(taskService, taskId, agentId)`
  - `executeTool(...)`
  - `success(...)`
- Register metadata and definitions in `packages/backend/src/mcp/cc-managed/server-registry.ts`.
- Keep existing `cc_tasks_management` tools unchanged.

### Tests

- Add route tests in `packages/backend/test/routes/cc-managed-mcp.test.ts`.
- Cover tool listing for chat and task-run tokens.
- Cover self ownership enforcement by creating two specialists and ensuring one cannot read/schedule/queue the other's task.
- Cover `create_self_task` only appears for task-run context.

## Phase 2: Self Draft Live Tools

### Tools

| Tool                     | Context | Purpose                                                                       |
| ------------------------ | ------- | ----------------------------------------------------------------------------- |
| `draft_self_task`        | `chat`  | Open a task creation form for operator review, then create a self-owned task. |
| `draft_self_task_update` | `chat`  | Open a task update form for operator review, then update a self-owned task.   |

### Tool Contracts

`draft_self_task`

- Input: partial create-task fields, except no `agentId`.
- Context: `chat`.
- Behavior: resolve calling specialist id, open a live request, then create task with `agentId` forced to the caller.
- Review fields: title, description, scheduledAt, dueAt, contextText, todos if the existing task form supports them cleanly.
- Metadata: include operation `create_self_task` and calling specialist id/name if cheaply available.

`draft_self_task_update`

- Input: `{ taskId, input? }`, with update fields except no `agentId`.
- Context: `chat`.
- Behavior: require self-owned task, open a focused review form, then update allowed fields.
- Disallow reassignment: no `agentId` field in input or form.

### Implementation Path

- Extend `self-task-tools.ts` or create `self-task-live-tools.ts` if the file becomes too large.
- Reuse the existing review/live-request shape from `createTaskLiveToolDefinitions` in `cc-tasks-management`.
- Keep these tools in `cc_default`.
- Mark `cc_default` as `interactive: true` only if required for the live-request wait timeout.
  - This has a tradeoff: all `cc_default` clients get the longer timeout.
  - Alternative: move live self tools to a separate default-enabled interactive MCP, but that violates the current request to keep this work around `cc_default`.

### Tests

- Verify chat token lists both draft tools.
- Verify task-run token does not list draft tools.
- Verify `draft_self_task` sends a live request and creates a task assigned to the caller.
- Verify `draft_self_task_update` refuses tasks owned by another specialist.

## Phase 3: Self Task Context

### Tools

| Tool                       | Context    | Purpose                                       |
| -------------------------- | ---------- | --------------------------------------------- |
| `read_self_task_context`   | `task_run` | Read context for a self-owned task.           |
| `append_self_task_context` | `task_run` | Append text to context for a self-owned task. |

These tools should follow the same ID-explicit model as the existing `read_task_context` and `append_task_context` tools. The task-run prompt already includes task and run identifiers, so no task-run-aware token plumbing is needed.

### Tool Contracts

`read_self_task_context`

- Input: `{ taskId }`.
- Context: `task_run`.
- Behavior: load `taskId`, require `task.agentId === callingSpecialistId`, then return `task.context`.
- Guardrail: knowing a task id must not be enough to read context for a task assigned to another specialist.

`append_self_task_context`

- Input: `{ taskId, text }`.
- Context: `task_run`.
- Behavior: load `taskId`, require `task.agentId === callingSpecialistId`, then call `taskService.appendContext(taskId, { text })`.
- Guardrail: knowing a task id must not be enough to append context to a task assigned to another specialist.

### Tests

- Verify tools list only in task-run context.
- Verify task context read/append works with an explicit `taskId`.
- Verify another specialist cannot read or mutate another specialist's task context.

## Phase 4: Self Task Templates

### Tools

| Tool                             | Context    | Purpose                                                                |
| -------------------------------- | ---------- | ---------------------------------------------------------------------- |
| `list_self_task_templates`       | `both`     | List task templates whose default specialist is the caller.            |
| `get_self_task_template`         | `both`     | Read one self-owned task template.                                     |
| `create_self_task_template`      | `task_run` | Create a self-owned task template directly.                            |
| `draft_self_task_template`       | `chat`     | Open a template creation form for operator review, then create it.     |
| `run_self_task_template_now`     | `both`     | Generate and queue a task from a self-owned task template immediately. |
| `create_self_task_from_template` | `both`     | Generate a normal self-owned task from a self-owned task template.     |

### Tool Contracts

`list_self_task_templates`

- Input: `{}`.
- Context: `both`.
- Behavior: call `taskService.listTemplates()` and return only templates where `defaultAgentId === callingAgentId`.

`get_self_task_template`

- Input: `{ templateId }`.
- Context: `both`.
- Behavior: load template and require `template.defaultAgentId === callingAgentId`.

`create_self_task_template`

- Input: same useful subset as `create_task_template`, except no `defaultAgentId`.
- Context: `task_run` only.
- Behavior: resolve calling specialist id and call `taskService.createTemplate({ ...input, defaultAgentId })`.
- Note: this can also be used as a cron-job-style tool by providing a recurring schedule in the template recurrence.
- Guardrails: reject any attempt to pass an agent/specialist id.

`draft_self_task_template`

- Input: partial create-template fields, except no `defaultAgentId`.
- Context: `chat`.
- Behavior: resolve calling specialist id, open a live request, then create the template with `defaultAgentId` forced to the caller.

`run_self_task_template_now`

- Input: `{ templateId, context?, contextAttachmentUploads?, metadata? }`.
- Context: `both`.
- Behavior: require self-owned template, then use the existing create-from-template and queue path.

`create_self_task_from_template`

- Input: `{ templateId }`.
- Context: `both`.
- Behavior: require self-owned template, then call `taskService.createTaskFromTemplate(templateId, { triggerSource: "template" })`.

### Implementation Path

- Add template definitions in `self-task-tools.ts` unless the file becomes too large.
- Reuse `createTaskTemplateInputSchema`, `taskTemplateRunNowInputSchema`, `taskTemplateSchema`, and `taskTemplateListSchema`.
- Reuse `triggerTemplateRun(...)` for `run_self_task_template_now` so context attachments follow the same path as the REST API.
- Reuse live request patterns from existing draft task tools for `draft_self_task_template`.

### Tests

- Verify self template list/get only returns templates owned by the calling specialist.
- Verify direct template create is task-run only.
- Verify draft template create is chat only.
- Verify direct and draft create force `defaultAgentId` to the caller.
- Verify run/create from template refuses another specialist's template.

## Phase 5: Self Artifacts

### Tools

| Tool                           | Context | Purpose                                             |
| ------------------------------ | ------- | --------------------------------------------------- |
| `list_self_task_artifacts`     | `both`  | List artifacts produced across runs of a self task. |
| `list_self_task_run_artifacts` | `both`  | List artifacts produced by one self-owned task run. |

### Tool Contracts

`list_self_task_artifacts`

- Input: `{ taskId }`.
- Context: `both`.
- Behavior: require self-owned task, list its runs, and return artifact summaries across those runs.

`list_self_task_run_artifacts`

- Input: `{ taskId, runId }`.
- Context: `both`.
- Behavior: require self-owned task, load run, and return artifact summaries for that run.

### Implementation Path

- Prefer the existing task run `artifacts` field for lightweight artifact summaries.
- If registered artifact metadata is needed, reuse `TaskArtifactService` instead of duplicating filesystem reads.
- Keep output shallow: title, description, path or URL, source run id, and timestamps when available.

### Tests

- Verify a specialist can list artifacts for its own task/run.
- Verify another specialist cannot list artifacts for a task it does not own.
- Verify empty artifact lists return an empty array, not an error.

## Phase 6: Self Profile

### Tools

| Tool               | Context | Purpose                                                   |
| ------------------ | ------- | --------------------------------------------------------- |
| `get_self_profile` | `both`  | Return the calling specialist's profile and capabilities. |

### Tool Contract

`get_self_profile`

- Input: `{}`.
- Context: `both`.
- Behavior: resolve the calling specialist from `context.agentSlug`.
- Output: id, slug, name, role, default model, status, workspace path, and full capabilities.

### Implementation Path

- Reuse `SpecialistService.getBySlug(...)`.
- Return structured content using `specialistSchema` or a narrower self-profile schema that includes `capabilities`.

### Tests

- Verify chat and task-run tokens can call it.
- Verify the output includes `capabilities`.
- Verify an unknown specialist slug returns a clear tool error.

## Out of Scope: Self History

Do not implement these in the first pass:

- `list_self_conversations`
- `get_self_conversation`
- `search_self_history`

Before implementation:

- Investigate the actual OpenCode server/API for session or message search.
- Check whether OpenCode search covers session messages or only workspace files.
- If OpenCode has session search, wrap it and apply self-scope filtering.
- If not, decide whether local SQLite search over `messages.content` is worth adding.
- Decide the product direction for direct conversation listing/transcript access before adding `list_self_conversations` or `get_self_conversation`.

## Suggested Delivery Order

1. Phase 1: self task reads and direct self task creation.
2. Phase 3: explicit-ID self context tools.
3. Phase 2: live draft tools, because timeout and review UX need extra care.
4. Phase 4: self task templates.
5. Phase 5: self artifacts.
6. Phase 6: self profile.

Phase 6 can move earlier if we want a very small first slice after Phase 1; it is the lowest-risk tool in the plan.

## Verification Checklist

- Run focused backend route tests for cc-managed MCP.
- Run focused service tests for task/conversation helpers.
- Run `pnpm lint`.
- Run `pnpm test`.
- Confirm generated specialist `opencode.jsonc` still includes `cc_default` for chat and task-run contexts.
- Confirm broad `cc_tasks_management` still supports cross-specialist admin workflows when explicitly enabled.
