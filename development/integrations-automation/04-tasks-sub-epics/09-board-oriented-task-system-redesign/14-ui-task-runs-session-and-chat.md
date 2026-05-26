# I4.9 UI Epic: Task Runs, Session Check, and Open In Chat

## Goal

Define task run review and session handoff so the operator can inspect AI execution, understand outcomes, and intentionally continue a run in chat when needed.

## Scope

- Run list.
- Run detail.
- Session health and diagnostics.
- Open in Chat flow.
- Return path from chat back to task detail.

## Run List

- Run timestamp or sequence.
- Executing agent.
- Status.
- Outcome.
- Trigger source.
- Target subtask when applicable.
- Final message preview.
- Artifact count.
- Duration when available.
- Session availability.

## Run Detail

- Result summary.
- Result text.
- Final assistant message.
- Human review reason.
- Error message and details.
- Artifacts.
- Rendered prompt.
- Rendered context snapshot.
- Linked session information.

## Session Check

- Show whether an OpenCode session exists for the run.
- Show whether the session can be opened in chat.
- Show diagnostics when opening is unavailable.
- Show whether the run has already been opened in chat.
- Disable Open in Chat when no recoverable session exists.

## Open In Chat Flow

- Open in Chat should be a deliberate action, not the default review path.
- If the run is already linked to a chat, navigate directly to that chat.
- If opening creates or switches chat context, show a lightweight confirmation.
- After opening, the chat should show a banner that it came from a task run.
- The banner should link back to the task and run detail.

## Acceptance Criteria

- The user can inspect every task execution attempt from task detail.
- The user can tell why a run is ready to check, in review, failed, cancelled, or completed.
- The user can open a run in chat intentionally and return to the task afterward.
- The user can diagnose missing or unavailable run sessions without guessing.
