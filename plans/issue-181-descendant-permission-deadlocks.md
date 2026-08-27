# Descendant Permission Deadlocks Implementation Plan

Tracked by [CommandsCenter issue #181](https://github.com/MaestroError/commands-center/issues/181).

## Goal

Route direct and nested OpenCode descendant interactions through their owning root conversation, preserve the root permission mode, reject cross-conversation replies, and fail closed when an interactive chat produces no observable root-or-descendant progress for 30 minutes.

## Constraints

- Use OpenCode 1.18.23 session metadata and child endpoints as the ancestry source of truth.
- Never trust an event or reply request merely because it shares a specialist directory.
- Do not globally allow external directories or auto-approve descendants of manual chats.
- Keep the dependency upgrade isolated in commit `024d383`.
- Add no database migration, setting, or dependency.

## Implementation

### 1. Session ancestry and reply authorization

- Extend `packages/backend/src/services/opencode-service.ts` to preserve `parentID`, list direct children, and recursively resolve a root session tree.
- Add focused adapter tests for direct children, nested descendants, malformed payloads, and cycle/duplicate safety.
- Change conversation permission/question reply methods to find the pending request and verify its session belongs to the resolved root tree before forwarding the reply.
- Test root, descendant, unrelated, missing, and already-resolved requests.

### 2. Descendant event routing and hydration

- Seed each OpenCode event subscription with the verified root session tree.
- Admit session-scoped events only for the root or verified descendants, refreshing ancestry when an unknown session emits an interaction.
- Preserve the originating descendant `sessionID` in mapped events.
- Filter chat and task-run pending permissions/questions against the complete verified tree.
- Cover direct and nested descendants, reconnect hydration, and unrelated-session isolation.

### 3. Permission-mode behavior and UI fallback

- For task runs, reply `once` to verified descendant permission asks because task runs have an effective `auto_approve` policy.
- If automatic task-run permission resolution fails, return the interaction to the existing blocked/review flow instead of hiding it.
- Continue to route questions to review.
- In interactive chat, keep the specialist-local frontend auto-approve toggle authoritative.
- Catch live SSE auto-reply failures and dispatch the permission into the existing conversation-level `PermissionDock`; manual mode uses the same dock directly.
- Keep interactions linked to tool rows when possible and rely on the existing conversation-level dock when the descendant call is not visible in the root timeline.

### 4. Bounded interactive-chat recovery

- Add a backend-owned interactive chat watchdog with a fixed 30-minute no-progress threshold and a short polling interval.
- Arm it around accepted asynchronous chat prompts and keep it independent of browser SSE connections.
- Build progress snapshots across root and recursive descendants; message, part, or descendant changes reset the deadline while status flapping and failed reads do not.
- On timeout, perform one final reconciliation, abort only the root session with a bounded request, and publish one explanatory `session.error` for active and reconnecting browser streams.
- Dispose watchdog handles during runtime shutdown.
- Test root/direct/nested progress, timeout, final reconciliation, abort failure, replay, replacement by a new prompt, and disposal.

### 5. Exact-head review maintenance

- Serialize watchdog replacement with an in-flight root abort so an older timeout cannot abort a newer prompt.
- Bound watchdog baseline reads with the configured OpenCode request timeout and fail open for prompt submission when preparation times out.
- Treat task-run permission auto-reply `NotFoundError` responses as resolved list/reply races while continuing to surface transient failures.
- Reconcile pending interactions authoritatively after SSE reconnect while preserving union semantics for the initial fetch/SSE race.
- Cover each race with focused backend or frontend regression tests.

### 6. Subscription, permission, and conversation lifecycle fencing

- Delay the browser-facing SSE readiness signal until the OpenCode event stream is established, then begin initial pending-interaction hydration so descendant asks raised during deferred ancestry are observable by either the stream or snapshot.
- Give each complete `getSessionTreeIds()` traversal one configured OpenCode request-timeout budget, combined with any caller signal.
- Share a per-task-run guard between cancellation and descendant permission auto-approval, and revalidate the persisted running state immediately before replying while holding that guard.
- Suppress live and hydrated auto-reply failure fallback when a matching terminal permission event has already been observed.
- Generalize the per-conversation prompt queue to serialize asynchronous sends, manual aborts, and deletion; load the conversation inside the queued operation so sends behind deletion fail with the existing not-found behavior.
- Cover deferred initial ancestry, cancellation during permission discovery, terminal-event-before-HTTP-failure ordering, abort during prompt acceptance, no-signal hanging ancestry, and deletion with queued sends.

### 7. Authoritative reconnect fallback fencing

- Advance an auto-approve fallback generation whenever a successful reconnect snapshot becomes authoritative.
- Capture the current generation for each live-event or hydrated permission auto-reply and surface a transient failure only while that generation remains current.
- Preserve existing behavior for current-generation transient failures, stale 404/410 replies, and terminal SSE replies.
- Cover older live-event and initial-hydration auto-replies whose HTTP responses fail only after an authoritative reconnect has removed the permission.

### 8. Upstream reconnect reconciliation

- Announce each internal OpenCode event-stream reconnection to the existing browser SSE stream so the frontend performs a new authoritative pending-interaction hydration.
- Apply a successful authoritative pending snapshot independently of conversation-detail refresh failure.
- Cover upstream reconnection without a browser reconnect and deferred live or initially hydrated auto-reply failures after a successful pending snapshot and failed detail refresh.

### 9. Repeated timeout, snapshot ordering, and restart recovery

- Preserve the original no-progress deadline when bounded watchdog polls time out, distinguish an internal poll timeout from handle cancellation, and still attempt the bounded root abort after the deadline.
- Fence initial and reconnect pending-interaction snapshots by request generation so only the newest requested reconciliation may update permissions, questions, live requests, or auto-approve fallback state.
- After OpenCode starts, find persisted active chat conversations whose sessions are still busy or retrying and re-arm their watchdogs from a fresh bounded baseline.
- Keep restart recovery best-effort per conversation, exclude task-run and idle sessions, and do not let recovery failure consume the OpenCode startup retry budget.
- Cover repeated timed-out polls after the deadline, initial-after-reconnect and overlapping-reconnect completion order, recovered settled turns, and startup recovery failure isolation.

## Verification

1. Run focused backend adapter, event, conversation, monitor, route, and watchdog tests.
2. Run focused frontend conversation and permission-dock tests.
3. Run ESLint with fixes on changed TypeScript files and Prettier on the plan/manifests.
4. Run repository type checking, lint, formatting, knip, unit/integration tests, and CLI build.
5. Review `git diff staging...HEAD`, status, generated files, and secret/debug-artifact scans.
6. Commit all functional changes and tests as `fix: handle descendant session interactions`.
7. Push the dedicated branch and open a draft pull request targeting `staging`.
