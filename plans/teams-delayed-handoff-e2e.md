# Delayed worker handoff acceptance

## Automated regression

`packages/backend/test/services/task-execution-service.test.ts` contains
"delivers a delayed worker result only after the owner's other queued task finishes".
It uses real CC database, conversation, Teams and queue services with controlled
SDK response gates. Gates make the sequence deterministic without real-time sleeps
or model-dependent timing.

1. Owner A delegates to worker W; W's response remains pending.
2. A ends its first turn and enters Waiting.
3. Another queued task B starts on A's specialist; its response remains pending.
4. W completes. Its result notification persists as Queued while B remains Running.
5. B completes. CC automatically delivers the notification into A's original
   session; B's conversation receives no team result and A gets no new run/session.

Separate regressions cover missed result recovery for completed/failed/error owners,
idempotence, and direct acceptance suppressing an undelivered notification as Handled.

## Manual live-provider check

Use disposable owner/worker specialists, with only the necessary Teams permissions.
The owner must permit the worker as a collaborator. Use text-only tasks and no
third-party integrations. No new wait tool or production testing hook is required.

- [ ] Queue goal A: ask the owner to delegate a substantial text-only report to W,
      then end its turn immediately without polling. Ask it to review and accept the
      result when CC delivers it automatically. Record A's run/session IDs.
- [ ] Once A is Waiting and W is Running, queue a separate substantial text-only
      task B for the same owner specialist. Confirm B is Running before W finishes.
- [ ] When W finishes, verify A's timeline and chat pending-message queue show a
      queued team result. Verify B continues uninterrupted.
- [ ] When B finishes, verify A resumes automatically without operator input,
      receives the team result, and accepts or revises the assignment.
- [ ] Verify A retained its original run/session IDs; B's conversation contains
      only B's work. Refresh and check that the timeline retains the handoff.

Live model timing is variable: if W finishes before B starts, that run does not
prove the busy-owner scenario. Repeat with a longer worker brief or use the gated
automated regression above as the deterministic acceptance check. Do not interpret
a direct tool-based acceptance as proof of queued notification delivery.
