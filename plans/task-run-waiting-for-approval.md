# Task Run Waiting For Approval

## Goal

Task runs should optionally support the same permission approval flow that workspace chat already uses. By default, task runs remain fully autonomous as they are today. When approval mode is enabled for a task or task template and a task-owned OpenCode session asks for permission, the task should become visibly attention-worthy on the board, the task detail panel should show a permission explanation card near the top, and the operator should be able to deny, allow once, or allow for the current run.

## Scope

- Reuse the existing OpenCode `permission.asked` / `permission.replied` events.
- Reuse the existing permission reply semantics: `reject`, `once`, and `always`.
- Apply this only to task runs and task templates through task permission configuration.
- Keep task runs fully autonomous by default.
- Require explicit opt-in from task and task template create/update UI before task runs pause for approvals.
- Keep the `question` tool denied for task runs in this implementation.
- Continue a task run after either approval or denial by replying to the pending OpenCode permission request.

## Current Observations

- Chat already renders `PermissionDock` and replies to permission requests through conversation routes.
- Task runs already create task-owned conversations and pass OpenCode permission rules into the session.
- Task effective permissions are persisted on each task run.
- Task permission rules currently force the `question` tool to `deny`.
- Task permission resolution currently normalizes task runs to auto-approve behavior.
- The task board/detail UI does not currently surface pending task-run permission requests.

## Implementation Plan

- [ ] Persist pending task-run permission request state.
  - Capture `permission.asked` events for task-owned conversations.
  - Associate each pending request with `taskId`, `taskRunId`, `opencodeSessionId`, request id, permission name, patterns, metadata, and created timestamp.
  - Clear the pending request on `permission.replied`.

- [ ] Add backend APIs for task-run approvals.
  - Expose pending permission data in task/task-run read models.
  - Add a task-run permission reply endpoint that accepts `reject`, `once`, or `always`.
  - Delegate replies to the existing OpenCode permission reply path for the task-owned conversation.
  - Return the updated task/task-run state after reply.

- [ ] Update task and task template create/update UI.
  - Add a clear optional control for requiring approval before tool actions.
  - Show the control on task create, task update/edit, task template create, and task template update/edit flows.
  - Default the control to off so newly created tasks and templates keep autonomous execution.
  - Persist the selected value in the existing task permission profile.
  - Ensure generated tasks inherit the template permission profile.

- [ ] Update task permission configuration.
  - Store the choice in the existing task permission profile.
  - Map the enabled state to OpenCode `ask` rules for selected tools/servers.
  - Map the disabled/default state to the current autonomous behavior.
  - Keep current auto-approved task-safe CC-managed tools allowed unless the operator configures stricter permissions.

- [ ] Highlight tasks waiting for approval on the board.
  - Show a `Needs approval` badge on task cards with pending permission requests.
  - Use a theme-based visual treatment that stands out in the queued column without relying on animation.
  - Include the requested permission/tool name when space allows.

- [ ] Add the task detail approval card.
  - Place it near the top of the task panel after the task description/context.
  - Show the requesting run, permission/tool name, patterns, and relevant metadata.
  - Render actions as `Deny`, `Allow once`, and `Allow`.
  - Treat `Allow` as approval for the current run/session, matching chat's existing `always` reply semantics.
  - Disable controls while the reply is in flight and refresh the task/run state afterward.

- [ ] Keep denial non-terminal.
  - On `Deny`, reply with `reject` and let the agent continue from the denied tool result.
  - Do not automatically fail, cancel, or archive the task run because of a denial.
  - Let the run outcome be determined by the agent and existing task-run completion flow.

- [ ] Update task-run prompts for human interaction expectations.
  - Instruct task runs to continue after denied permissions when possible.
  - Keep direct question asking unavailable for task runs.
  - Instruct the agent to mark the run for human review when it needs clarification that cannot be answered through permissions.

- [ ] Add tests.
  - Backend service tests for capturing and clearing pending permission requests.
  - Route tests for task-run permission replies.
  - Task permission tests for generating `ask` rules from the task/template configuration.
  - Frontend tests for board highlighting and task detail approval actions.
  - Regression tests that denial replies do not directly mark the task run as failed.

- [ ] Verify.
  - Run `pnpm format:fix`.
  - Run `pnpm lint`.
  - Run focused backend and frontend tests for task permissions, task execution, task routes, and task UI.
  - Run broader tests if shared schemas or task run state shapes change.
