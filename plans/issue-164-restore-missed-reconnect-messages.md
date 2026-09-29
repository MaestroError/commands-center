# Restore Missed Messages After an Upstream Reconnect

**Goal:** Make the reconnect hydration that already runs after an upstream OpenCode event-stream reconnect actually restore the messages persisted during the gap, including when the live stream delivers an event while the snapshot request is in flight.

**Architecture:** The signal and the request already exist on staging: `opencode-event-service` reports `onReady` per upstream connection, `conversation-events` emits `connected` with `reconnected: true` from the second one onward, and `use-conversation` refetches conversation detail plus an authoritative pending-interactions snapshot. Only the application of the detail snapshot changes — from a wholesale `HYDRATE_DETAIL` that had to be discarded whenever a live event raced it, to an additive `MERGE_RECONNECT_DETAIL` that the live stream always outranks.

**Tech Stack:** React reducer state in `use-conversation`, Vitest + Testing Library.

**Source:** [GitHub issue #164](https://github.com/MaestroError/commands-center/issues/164)

## Global Constraints

- Live state wins for anything the stream has already delivered: message content, parts, session status, send errors, pending interactions and todos are never overwritten by a snapshot, and a message the stream deleted is never restored by one.
- Only a newer snapshot supersedes an in-flight one; live events no longer discard it.
- The upstream reconnect signal, the browser SSE reconnect path, backoff, and pending-interaction hydration stay exactly as they are.
- No backend, schema, transport or persistence changes.

## Steps

- [x] Add a `MERGE_RECONNECT_DETAIL` action that unions snapshot and live messages by id, keeps the live copy of every shared id, orders snapshot messages first and live-only additions after, and merges parts only for restored messages.
- [x] Dispatch it from the reconnect branch and drop the event-sequence bail-out, keeping the hydration-generation guard.
- [x] Exclude messages removed by live `message.removed` events for the lifetime of the conversation's stream.
- [x] Cover restoration alongside a racing live event, a racing deletion, a snapshot that adds nothing, and the existing no-clobber guarantees.

## Verification

- `pnpm --filter @cc/frontend test`
- `pnpm lint`, `pnpm typecheck`, `pnpm knip`, Prettier check
