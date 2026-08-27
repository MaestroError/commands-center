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

## Verification

1. Run focused backend adapter, event, conversation, monitor, route, and watchdog tests.
2. Run focused frontend conversation and permission-dock tests.
3. Run ESLint with fixes on changed TypeScript files and Prettier on the plan/manifests.
4. Run repository type checking, lint, formatting, knip, unit/integration tests, and CLI build.
5. Review `git diff staging...HEAD`, status, generated files, and secret/debug-artifact scans.
6. Commit all functional changes and tests as `fix: handle descendant session interactions`.
7. Push the dedicated branch and open a draft pull request targeting `staging`.
