# Proposal: adopt OpenCode 1.17 v2 API surface where it simplifies CC

Status: idea backlog, not scheduled. Captured while auditing the 1.16.2 → 1.17.20
upgrade (see `examples/opencode`, gitignored clone of the OpenCode source used for
the diff). None of these are required: every legacy endpoint CC uses is unchanged
in 1.17.x, and the upgrade itself only required removing the storage-repair shim.

All endpoints below live under the new `/api` (v2) surface, so each can be adopted
independently and incrementally.

## Candidates

### Integrations & credentials API

`/api/integration`, `/api/integration/{id}/connect/key`,
`/api/integration/{id}/connect/oauth`, `/api/integration/attempt/{attemptID}`,
`/api/credential/{credentialID}`.

OpenCode now models provider/integration connections first-class, including keyed
and OAuth connect flows with attempt tracking. Chunks of CC's `provider-service.ts`
(auth-method merging, OAuth authorize/callback plumbing via
`provider.oauth.*`) could eventually delegate to this instead of reimplementing the
flow. Biggest potential simplification of the list; also the least mature — watch
how stable the schema is across 1.17.x patches before building on it.

### Per-session event stream

`/api/session/{sessionID}/event`.

CC currently consumes the global `/event` SSE firehose in
`opencode-event-service.ts` and filters per session. Task-run monitoring
(`task-run-monitor-service.ts`) and live conversation views could subscribe to a
single session's stream instead — less filtering, less coupling to global event
ordering, and reconnects scoped to one session.

### Session revert / checkpointing

`/api/session/{sessionID}/revert/stage`, `/revert/commit`, `/revert/clear`, plus
`/api/session/{sessionID}/history`.

Building blocks for undo/checkpoint UX in CC conversations ("roll back to before
this prompt"). Nothing in CC exposes this today; would be a new user-facing
feature rather than a refactor.

### Session control conveniences

`/api/session/active`, `/api/session/{sessionID}/interrupt`,
`/api/session/{sessionID}/model`, `/api/session/{sessionID}/agent`.

Direct setters/queries CC currently approximates through legacy endpoints or
config writes (e.g. model switching per session). Low effort, low risk.

### PTY connect tokens

`/api/pty/{ptyID}/connect-token`.

Token-authenticated PTY attach. CC's terminal proxy connects to
`/pty/{id}/connect` directly today; connect tokens would let the backend mint
short-lived credentials for the frontend instead of proxying trust. Hardening,
not functionality.

### Capability discovery

`/experimental/capabilities`.

Lets CC feature-detect the engine instead of pinning behavior to a version range.
Useful the moment CC supports more than one OpenCode minor at a time (e.g. during
future upgrades); pairs well with the tilde version pin strategy in
`plans/opencode-patch-version-range.md`. Experimental prefix — expect churn.

## Notes from the 1.16.2 → 1.17.20 diff

- Legacy (non-`/api`) surface: zero paths added or removed; request/response
  specs for every endpoint CC calls are byte-identical.
- v2 renamed permission/question reply routes
  (`/api/session/{id}/permission/request/{rid}/reply` →
  `/api/session/{id}/permission/{rid}/reply`) — a reminder that the v2 surface
  still moves; prefer legacy endpoints for anything CC needs to be stable until a
  capability check exists.
- 1.17 adds an `XDG_STATE_HOME`-based state root — already handled in
  `plans/opencode-state-dir.md`.
- 1.17's migrations drop the `session_context_epoch` columns CC's storage-repair
  shim used to add; the shim was removed as part of the 1.17.20 upgrade.
