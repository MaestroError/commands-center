# Issue 164: Rehydrate After Upstream Event Reconnect

## Goal

Restore direct-chat messages and pending interactions missed while the backend reconnects its upstream OpenCode event stream, without requiring the browser SSE connection to close.

## Plan

1. Extend the shared chat-event schema with an explicit `upstream.connected` event whose `reconnected` flag distinguishes the initial OpenCode subscription from later successful reconnections.
2. Update the OpenCode event service to emit that signal for each upstream `server.connected` event while preserving the browser-facing `connected` event and reconnect loop.
3. Add a reconnect-specific conversation reducer action that merges hydrated messages and parts by ID, retaining live-only state and pending interactions instead of replacing the active timeline.
4. Update the conversation hook to rehydrate conversation detail and pending interactions after `upstream.connected` reports a reconnection, while leaving initial loading and browser SSE reconnect hydration/backoff unchanged.
5. Add focused shared-schema, backend service, reducer, and hook tests for initial versus repeated upstream connections, missed-message recovery, pending interactions, and live events ordered around reconnect hydration.
6. Run formatting with fixes, focused tests, lint with fixes, type checking, dead-code analysis, build, broader unit/integration tests, and local E2E only when a supported Chromium executable is available. Review the complete diff before committing, pushing, and opening one draft PR against `staging`.

## Non-Goals

- Do not change attachment upload or rendering, runtime-status reconciliation, task-run recovery, browser SSE backoff, or transport architecture.
- Do not add polling, event replay persistence, database changes, dependencies, or operator-facing settings.
