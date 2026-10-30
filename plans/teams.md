# Teams and durable task-run replies

Date: 2026-10-30
Status: Implemented and committed as `695d9dcf` on `codex/teams`.

The task lifecycle and UI contracts below are superseded by
[single-task-execution.md](single-task-execution.md).

This replaces the previous Teams plan. Implement a small, complete delegation flow
and a reply queue shared by ordinary task runs and team assignments. Named agents
from the discussion are illustrative only; use disposable specialists for tests.

## Goal and success criteria

An assigned specialist can complete a goal with help from permitted specialists.
Each keeps its own instructions, tools, permissions, model, workspace, and session.
CC schedules work, transfers selected results, resumes the owner, and exposes the
actual state to the operator. The operator need not manually transfer outputs or
wake the owner after each handoff.

Replies to any eligible task run are persisted even when that run is executing or
its specialist is occupied by another task. Chat and the outer task panel show the
same pending messages, their destination, and why delivery is waiting.

First independent milestone: reply to ordinary run A while its specialist executes
run B; the reply survives restart, is delivered automatically to A's existing
session when eligible, and its answer is visible in both UI surfaces.

First Teams milestone: owner delegates, worker produces an artifact, owner yields,
CC restarts, owner resumes with the worker result, consumes the artifact, and
submits the final deliverable for operator review.

## Scope

Include:

- One owner per goal execution; only the owner submits the overall final result.
- Operator-configured permitted collaborators on each specialist.
- Owner-only delegation of bounded assignments, including parallel assignments
  to different specialists and sequential execution per specialist.
- Separate worker sessions and worker-specific configuration.
- Durable task-run replies, worker-result notifications, waiting, and resumption.
- Selected input/output artifacts, owner review, and worker revisions in the
  assignment's existing session.
- Failure, cancellation, bounded retries/delegation, and restart recovery.
- Task-level collaboration visibility plus a shared pending-message view in chat
  and the outer task panel.

Defer recursive delegation, self-delegation, a separate Team entity, arbitrary
workflow/dependency graphs, peer messaging, and mandatory shared directories.
The owner can express a dependency by delegating the next assignment after
receiving the prerequisite result. Ordinary standalone chats are not being given
an application-wide message queue in this change; task-run conversations opened
in the chat page are in scope.

## Current implementation: reuse and gaps

Paths below are relative to `packages/backend/src/` unless stated otherwise.

| Area               | Foundation                                                                           | Change needed                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Task data          | `db/schema/tasks.ts`: tasks, assigned subtasks, runs, conversations, followups       | Identify goal executions, delegated assignments, waiting and pending delivery separately                                         |
| Reply delivery     | `services/task-execution-service/reply-flow.ts`                                      | Currently rejects running targets and busy specialists before inserting a reply; persist first, schedule delivery later          |
| Followup state     | `services/task-service/feedback-subtask-ops.ts` and shared task schemas              | Currently starts at `sending`, then `answered`/`failed`; represent pending, cancellation, delivery attempts and turn correlation |
| Scheduling         | `services/task-execution-service/agent-drain.ts` and running-agent unique constraint | Schedule both queued runs and ready resumptions fairly without concurrent task turns for one specialist                          |
| Execution recovery | Accepted-prompt evidence and run monitor                                             | Reuse reconciliation, distinguish pending/accepted/answered delivery, and avoid blind resend                                     |
| Parent state       | `services/task-service/context.ts`                                                   | Child terminal states currently update parent status/results; delegated completion must not finalize the goal                    |
| Run preparation    | `services/task-execution-service.ts`, `task-service/run-ops.ts`                      | Do not inherit parent task permission overrides/model for a worker                                                               |
| Context            | `services/task-run-context-service.ts`                                               | Existing subtask context is feedback-oriented and prepared at queue time; use bounded assignment inputs resolved at dispatch     |
| Identity           | `opencode/embedded-tool-caller.ts`                                                   | Reuse trusted run/session identity for delegation and participant authorization                                                  |
| Artifacts          | `services/artifact-service.ts`, `artifact-delivery-service.ts`                       | Reuse producer resolution/snapshots; add authorized, usable cross-specialist handoff and check concurrent publication            |
| Task UI            | `packages/frontend/src/components/tasks/task-feedback-section.tsx`                   | Current reply panel disables active runs and promises immediate delivery; replace with truthful queue behavior                   |
| Chat UI            | `packages/frontend/src/pages/WorkspaceChatPage.tsx`, hooks and conversation routes   | Route task-session prompts through the same queue; prevent direct-prompt paths bypassing delivery serialization                  |
| Query state        | `packages/frontend/src/hooks/use-tasks-query.ts`                                     | Currently polls only `sending`; synchronize pending and delivery changes across both surfaces                                    |

## Reply queue contract: ordinary tasks and Teams

### Acceptance and targeting

- Validate and persist a reply before attempting to acquire execution capacity.
  A successful response means accepted into the queue, not delivered to the model.
- Busy specialist, running target, or an already pending reply are normal queue
  conditions, not conflicts. An idle eligible run uses the same queue and can
  dispatch immediately.
- Accept replies for queued/running/waiting runs and completed/failed/error runs
  that can continue. A queued run with no session keeps replies until its initial
  turn completes; never silently merge them into its original prompt.
- Completed/failed/error runs resume their existing session. If that session is
  missing or cannot be recovered, expose a blocker and explicit recovery action;
  do not silently create a replacement or claim successful delivery.
- Bind messages to exact task, execution, run, and conversation when available.
  Reruns never redirect old replies into the newest execution.
- Cancelled runs, deleted/archived tasks, and unavailable specialists cannot be
  silently revived. Reject new invalid submissions clearly; cancel or block
  already accepted messages according to the relevant lifecycle transition.
- Add a stable client request identifier so retrying an uncertain HTTP response
  does not insert the same operator message twice. Server-generated events use a
  separate stable identity. Validate ownership at every entry point.

### Message state and ordering

- Reuse/extend existing followup storage and APIs where appropriate. Define a
  durable envelope containing source, target, body/structured payload, sequence,
  deduplication key, timestamps, delivery state, and failure/blocking reason.
- Sources distinguish operator reply, structured review answer, and CC-generated
  assignment event. Clients cannot impersonate a system event through a label in
  their message. Preserve review-question correlation and existing validation.
- Define pending, delivering, accepted/awaiting-answer, answered/processed,
  failed, and cancelled states. `sending` alone must not ambiguously cover all
  stages. Final schema names are chosen in phase 1.
- Preserve per-destination acceptance order. Initial implementation delivers one
  operator reply per turn, preserving its answer relationship. Batch contiguous
  system events only where ordering is retained and every included event is
  individually correlated; never merge or rewrite operator messages silently.
- Give each delivery turn its own correlation identity. A terminal callback must
  finalize only messages included in that turn, not all pending messages on a run.
- Cancel an operator message only while pending, using an atomic transition that
  races safely with dispatch. Cancelling a queued reply does not cancel the run.
  Editing and manual reordering of queued replies are deferred.
- Retry proven pre-acceptance transport failures within a bound. If SDK acceptance
  is uncertain, reconcile recorded evidence/session messages before resending;
  unresolved uncertainty is visible and requires recovery, not an infinite retry.

### Scheduling and lifecycle

- Extend the existing persistent scheduler/drain rather than add a second engine
  or an independent Teams-only queue. Keep one actively executing task turn per
  specialist and one prompt at a time per session.
- Select the oldest ready work item across initial runs and resumption requests,
  using stable ordering. A newly eligible next reply enters fairly; a long stream
  of replies must not monopolize the specialist. Blocked entries do not prevent
  unrelated ready work from running.
- A reply arriving during an active turn waits for the next safe boundary; it
  neither interrupts that turn nor takes effect retroactively. Keep Stop separate.
- Waiting owners release their specialist slot. Worker-result events wake owners;
  operator replies can also wake them while workers continue. No polling LLM turns.
- Claim delivery capacity and change state atomically. Record result completion
  and its outgoing notification in the same database transaction where possible;
  reconcile incomplete transitions at startup and after failures.
- Persist the reason work is waiting: current turn, specialist occupied, worker
  results pending, engine unavailable, or missing/unavailable destination.
- Suppress misleading final-goal completion while accepted replies still need
  processing. Preserve completed-turn evidence while a continuation is queued.
- Cancelling a goal stops future dispatch, cancels pending messages/assignments,
  and attempts to stop active workers. Late results remain recorded but cannot
  reopen the cancelled goal. Explicit retry/resume is separate from late events.
- This promises same-installation restart recovery. SDK acceptance and external
  side effects do not offer a blanket exactly-once guarantee; never blindly repeat
  posting/publishing actions after an ambiguous outcome.

### Chat and outer task panel

- Task-run chat sends and task-panel replies enter the same backend queue. Audit
  prompt, command, shell, conversion, and abort paths so a task conversation cannot
  accidentally bypass ownership, pending-turn serialization, or cancellation.
  Keep supported attachment/model selections intact in durable payloads where
  already supported; clearly reject unsupported payloads before accepting them.
- Above the chat composer, show pending replies/events for that destination with
  source, preview, order, state, waiting reason, and cancel controls for pending
  operator replies. Display the same queue in the outer task panel, including
  destination specialist/run when viewing multiple assignments.
- Allow additional text replies while execution is busy. Label acceptance as
  "Queued" until delivery is confirmed; do not insert an unsent message into the
  delivered chat transcript. Preserve the draft on submission failure.
- Show a pending count in the collapsed task-panel section. Keep delivery errors
  and recovery controls accessible after items leave the pending list.
- Use shared query keys/API data and a reusable queue composition. Reconcile on
  refresh/reconnect and synchronize both surfaces through existing event/query
  mechanisms. Browser-local state is not the queue's source of truth.
- Structured review/permission interactions retain their dedicated behavior;
  generic queued text must not masquerade as answering an SDK permission request.

## Teams contract

### Ownership and delegation

- A goal execution groups the owner's session, assignments, events, and final
  deliverable. Deliberate reruns create a new execution; replies continue the same
  execution. Keep assignment revisions/attempts distinguishable within it.
- Persist an operator-controlled permitted-collaborator list in specialist files.
  The owner sees concise public capability descriptions, not private instructions.
  Delegation authority is explicit because a collaborator can perform actions the
  owner cannot perform directly.
- Native CC tools cover permitted collaborator discovery, delegation, assignment
  status/result reads, artifact access, waiting, revision requests, and completion.
  Validate trusted caller identity, owner role, execution membership, and target
  authorization. Do not grant broad task-management tools as a shortcut.
- Delegation returns an assignment ID promptly. Its brief contains objective,
  expected deliverable, constraints, selected context/artifacts, and acceptance
  criteria. Deduplicate tool-call retries so one request cannot create two jobs.
- Workers retain their own instructions/model/fallbacks/task-context permissions.
  Do not copy the parent's task overrides. Preserve autonomous Ask-to-Allow and
  Deny enforcement. Workers cannot delegate further in this version.
- Snapshot effective execution configuration. Check collaborator authorization at
  creation and dispatch; revocation blocks unstarted work and notifies the owner.
  Already executing work retains its recorded configuration until cancelled.

### Outcomes, revisions, artifacts, and completion

- Return structured outcome, summary, selected artifact IDs, validation evidence,
  and unresolved problems. Completion generates a durable event to the owner.
- Worker completion is separate from owner acceptance. The owner can request a
  bounded revision in the assignment's existing session through the same inbox;
  retain earlier outcomes/artifact versions and identify the revision in events.
- Transfer usable content via producer-aware artifact resolution and stable file
  snapshots, without public exposure or broad access to private directories.
  Resolve selected inputs when dispatching and retain provenance. Workers read
  only explicitly shared inputs and their own outputs; owners read their assigned
  workers' returned outputs. IDs alone do not authorize access.
- Only the owner submits the overall final result, then normal operator review
  applies. Require accepted outputs or explicit resolution of failed/cancelled
  assignments; unfinished children/pending owner input block final submission.
- A worker failure notifies the owner instead of replacing the task's final result.
  The owner can retry within limits, revise the approach, or report a blocker.
- Add bounded assignments, revision attempts, and active-turn timeouts. Select
  concrete conservative defaults in phase 1; do not confuse intentional waiting
  with a stalled turn or claim a monetary cap without enforceable accounting.
- Show owner, assignments, assignees, recorded states, waiting reasons, outcomes,
  artifacts, pending input, and session links on the task page. Show actual events
  rather than treating model-written progress claims as execution evidence.

## Implementation sequence

- [ ] **1. Specify contracts and migrations.** Finalize queue states, delivery-turn
      identity, request idempotency, scheduling fairness, goal-execution linkage,
      cancellation/review behavior, and numeric limits. Map existing reply/chat
      entry points and session conversion behavior. Prepare Zod/API/DB designs.
      Identify concrete reuse refactors and obtain required confirmation before
      implementation. Verify ordinary task and team lifecycle transition tables.
- [ ] **2. Ship the ordinary task reply queue end to end.** Persist first; implement
      dispatch/recovery on the existing scheduler; preserve reply-answer linkage.
      Wire task-run chat and task panel to the same queue with pending visibility,
      cancellation, and truthful status. Prove busy-other-task, active-same-task,
      multiple replies, fair scheduling, and restart recovery before adding Teams.
- [ ] **3. Add authorized delegation and isolated worker configuration.** Persist
      collaborator lists; link owner execution and assignments; expose scoped tools.
      Prepare bounded worker context and separate child completion from parent
      finalization. Verify identity, permissions, model choices, and access denial.
- [ ] **4. Complete one durable team handoff.** Reuse the queue for worker events,
      owner yielding/resumption, artifact consumption, and revision requests.
      Verify the delegate/artifact/restart/resume/final-review milestone, including
      ordinary operator replies arriving during worker execution.
- [ ] **5. Complete collaboration UI and lifecycle controls.** Add assignment and
      outcome visibility to the task panel, destination-aware queue views, links,
      failure/retry/cancel controls, and updated task/global tool instructions.
      Reuse frontend compositions under the CC design-system rules.
- [ ] **6. Validate and document.** Add deterministic service/route tests and browser
      flows, then harmless live acceptance with disposable specialists. Run ESLint
      with `--fix`, formatting, typechecks, relevant/full required tests, E2E, and
      design-system audit. Document delivery semantics and known limits.

## Acceptance checklist

- [x] Ordinary run A accepts a reply while its specialist works on B; B completes,
      A resumes its existing session, and both UI surfaces show the correct answer.
- [x] Replies accepted during the same active run wait until its safe boundary.
      Multiple replies preserve order and distinct answers without starving jobs.
- [x] Queue state survives refresh, reconnect, restart, and duplicate HTTP requests.
      Cancel-versus-dispatch races have one recorded outcome; no message vanishes.
- [x] Crash before delivery retries safely; crash after SDK acceptance reconciles
      without blind resend; delayed terminal callbacks cannot answer a later reply.
- [x] Queued runs accept pending input before session creation. Missing sessions,
      cancelled/archived targets, and unavailable specialists expose explicit states.
- [x] Chat/task-panel views agree on destination, count, source, body, state, reason,
      and cancel controls. Ordinary chats retain existing behavior.
- [x] Owner delegates to permitted collaborators only. Worker instructions/model
      and permissions remain independent; unauthorized task/artifact reads fail.
- [x] Different workers run independently; assignments to one worker serialize.
      Waiting owners release capacity and resume automatically with correct events.
- [x] Artifact handoff crosses specialist directories with usable immutable content
      and provenance, without public exposure or private-workspace sharing.
- [x] Revisions retain assignment/session history. Owner acceptance is distinct
      from worker completion; failed children cannot mark the goal successful.
- [x] Cancellation stops queued continuations; late results do not revive the goal.
      Reruns cannot consume previous-execution events or redirect queued replies.
- [x] Operator can identify owner, active assignments, waiting causes, deliverables,
      queued feedback, and required intervention without reading every transcript.

## Persistence and repository constraints

Reuse existing services and infrastructure; no new orchestration dependency is
planned. Reusable collaborator configuration belongs in workspace files, with
workspace-relative artifact/configuration references. SQLite holds durable local
runtime queues and history; portability does not promise active-session recovery
on another installation. Existing portable task/template configuration must still
restore correctly without runtime history.

Generate DB migrations with matching Drizzle metadata. Before any filesystem
migration, read `skills/write-filesystem-migration/SKILL.md`. Review the default
workspace `.gitignore` for new file state; seed changes only in newly initialized
workspaces and never migrate existing `.gitignore` files.

Use `codex/opencode-v2-migration` as the integration base. Follow repository reuse
refactor/dependency approvals and explicit commit authorization. This plan records
scope and sequencing; live specialist configuration is changed only through the application.

## Implementation decisions (2026-10-30)

- [x] Inspect current services and create `codex/teams` from integration base.
- [x] Extend followups with queued/delivering/blocked/cancelled states, durable
      prompt payload, request identity, baseline and acceptance timestamps.
- [x] Refactor delivery and reuse task reply composition after requested approval.
- [x] Implement and verify ordinary queued replies before Teams orchestration.
- [x] Implement delegation, artifact handoff and collaboration UI.
- [x] Run repository verification and update this checklist with evidence.

Use the owning root run ID as execution identity; no separate Team or goal entity
is needed. Each delegation links to that owner run and a normal worker subtask/run.
Start with at most 20 assignments per execution and 3 revision requests per
assignment. Existing configured task-turn timeouts apply; deliberate waiting has
no active-turn timeout. Keep one operator reply per delivery turn; system events
are also delivered individually initially. Batched events are an optimization to
defer until needed. Missing or ambiguous delivery evidence blocks visibly rather
than risking duplicate external effects.

## Implementation and verification evidence

- The user approved reuse of reply delivery, scheduling, and the shared reply UI.
- Generated migrations `0042_good_mantis` and `0043_dry_the_hand` include Drizzle
  snapshots and journal entries. No filesystem migration is required.
- Native tools: `list_teammates`, `delegate_assignment`, `list_team_assignments`,
  `accept_team_assignment`, `revise_team_assignment`, and `read_team_artifact`.
  Ending an owner turn with unresolved assignments implements waiting.
- Operator request IDs and internal event IDs use separate namespaces. Retries
  preserve the client request ID; one message is delivered per continuation.
- There is no public SDK receipt that proves a failed submission never started.
  Ambiguous claims are blocked and reserve the specialist until cancelled;
  recovery never guesses that repeating an external action is safe. Undelivered
  blocked messages can be cancelled without stopping a run.
- Unit/integration checks cover busy-specialist queuing, restart recovery, duplicate
  submissions, ordered distinct answers, cancellation, worker permission/model
  independence, assignment ownership, revisions, immutable artifact handoff,
  concurrent snapshot publication, and portable collaborator configuration.
- Real embedded browser flows verify cross-task queued replies in chat and the
  task panel, plus native delegation → worker execution → owner continuation →
  acceptance. The provider is deterministic and local; these tests do not spend
  credits or publish to real external services.
- Standard browser regression: 176 passed, 56 existing skips. Embedded browser
  acceptance: 40 passed. Initial complete unit/integration run: 3,766 passed.
- Type checks, ESLint (including `--fix` on changed files), design-system audit,
  and CLI production build passed. A later heavily delayed parallel run experienced
  widespread timeouts; the complete backend rerun with two workers passed all
  1,832 tests in 92 seconds. The final affected frontend rerun passed 187 tests.

Operator instructions and current limits are in [docs/teams.md](../docs/teams.md).
