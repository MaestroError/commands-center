# Issue 163: Reset Task Monitor Lifetime for Replies

## Goal

Give each accepted reply continuation a fresh persisted monitor lifetime without changing the existing OpenCode session or initial-run timeout behavior.

## Plan

1. Reset the persisted task-run start timestamp when a terminal run is reactivated for an operator reply, alongside the existing terminal-state cleanup.
2. Keep the monitor's existing persisted `startedAt` calculation so both immediate monitoring and startup recovery use the continuation timestamp.
3. Extend service coverage to verify old runs do not time out from their original timestamp, continuation timeouts report the new elapsed lifetime, successful replies retain their session, and a restarted execution service uses the persisted continuation baseline.
4. Extend route coverage to verify reply reactivation exposes a fresh start timestamp through the existing API flow.
5. Run formatting, lint with fixes, focused backend tests, type checking, the backend suite, and applicable repository checks before review.
