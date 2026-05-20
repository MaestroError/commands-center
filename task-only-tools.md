Today, we are going to enhance task runs with "result", "artifacts" & "needs_human_review" fields.

## Goal

Give AI Agents capability to return clear feedback regarding the task. On other side, give users ability to quickly and easily access the outcome of the task, get results and decide the next actions.

### result field

Allow AI Agents to explicitly define the outcome and briefly explain how it has been done: report a final result in case of success, mark task as failed and explain why isn't task finished with needed results (here agent may ask for confirmation of final action, or ask for extra tools to make the task feasible, and just explain that task failed because of outage in external service and we can try again later, and other things like those)

### Artifacts

Any documents, images, videos and other files as well as link generated as the outcome of task should be linked here by the AI Agent. For example, if the task was to write a blog, AI Agent may add markdown file with an article inside. If task was a research, AI Agent might add the important URLs from findings for user to check them out.

### needs_human_review field

Some tasks, maybe because of failure, or becuase of it needs the extra steps to be finished may need more attention from user. For example, if task was to write the LinkedIn post and send to the email using gmail account and AI Agent wrote the post, but couldn't send because lose access to google account (it happens, since google needs to rewoke key in every 6 months) - it means that task is partially done but to finalize, it needs human interaction to manually send the written Post via Gmail. In such cases, the AI agent might add explanation in result, and mark needs_human_review as true.

The users will mainly use tasks for automations, their intention is to just set it up and forget about that. The needs_human_review will mark some task runs as "important" to gain the attention of user. (Later, we will also add notification for it)

# Implementation Plan

1. Rename `resultSummary` to `finalMessage`
   Verify: shared schemas, backend services, routes/tests compile with `finalMessage`; DB migration renames `task_runs.result_summary` to `final_message` and task latest summary equivalents if applicable.

2. Add task-run outcome fields
   Add columns:
   `task_runs.result_text`
   `task_runs.artifacts_json`
   `task_runs.needs_human_review`
   `task_runs.human_review_reason`
   Verify: create/update/list/get task run APIs expose these fields with defaults.

3. Keep `result_json` app-owned
   Continue using `result_json` for CC metadata such as `conversationId` and `messageCount`.
   Verify: no agent-facing tool writes to `result_json`.

4. Define shared schemas
   Add:
   `taskRunArtifactSchema`
   `setTaskRunResultInputSchema`
   `addTaskRunArtifactInputSchema`
   `markTaskRunNeedsReviewInputSchema`
   Artifact shape:

```ts
{
  title: string;
  description?: string;
  url?: string;
  path?: string;
}
```

Validation: exactly one of `url` or `path`.

5. Add task-run update service methods
   Add methods on `TaskService` or a focused helper:
   `setRunResultText(taskRunId, agentId, resultText)`
   `addRunArtifact(taskRunId, agentId, artifact)`
   `markRunNeedsHumanReview(taskRunId, agentId, reason?)`
   Validation:
   `taskRunId` exists
   `agentId` matches calling agent
   run status is `running`
   Verify: invalid agent/run/status cases fail.

6. Add `cc_default` managed MCP server
   Add a new CC-managed server:
   `name: "cc_default"`
   `routeSegment: "cc-default"`
   `enabledByDefault: true`
   It is system-managed and should not be controlled by the normal user capability UI.
   Verify: every agent workspace receives the static MCP entry.

7. Add task-run tools to `cc_default`
   Tools:
   `set_task_result`
   `add_task_artifact`
   `mark_needs_human_review`
   All require `taskRunId`.
   All resolve `agentSlug -> agentId`, then validate ownership/status before updating.
   Verify: tool calls return structured content with updated task-run fields.

8. Preserve task-context filtering
   Mark these 3 tools `context: "task_run"`.
   Deny all "task_run" tools in `opencode.jsonc` file.
   Explicitly allow each "task_run" tools via task's effective permissions (POST /session accepts a permission field).
   Explicitly deny chat only tools via effective permissions.

9. Update task execution finalization
   When a task prompt completes, set:
   `finalMessage` from last assistant message
   `result_json` with CC metadata
   Do not set `result_text`; only the MCP tool sets it.

Verify: old behavior remains available via `finalMessage`.

10. Add migrations
    Generate migration for:
    `result_summary -> final_message`
    `latest_result_summary -> latest_final_message` on `tasks` and `task_templates`, if we want full naming consistency
    new task-run columns
    Verify migration applies cleanly.

11. Add tests
    Backend tests:
    schema validation for artifacts
    task service update methods
    MCP tool success/failure paths
    task execution still records final message and CC metadata
    Verify with `eslint --fix` and test suite.

**Open Decision Before Implementation**
For full consistency, I propose renaming:
`tasks.latest_result_summary` -> `latest_final_message`
`task_templates.latest_result_summary` -> `latest_final_message`

This matches the `resultSummary -> finalMessage` rename everywhere.
