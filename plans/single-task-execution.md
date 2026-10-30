# One task, one owner execution

Status: Implemented and verified. Supersedes the rerun/feedback-subtask portions of `teams.md`.

## Contract

- A task has one owner execution/session; a fresh attempt requires duplicating the task.
- Teammates remain isolated assignments with their own sessions; revisions reuse them.
- Operator feedback is a durable reply, including input saved before the first run.
- Replies continue completed executions; stopped executions require explicit Continue.
- Missing sessions and uncertain delivery block visibly, never create replacement sessions.
- A single chronological task timeline shows replies, answers, delegation, results,
  revisions, acceptance and cancellation. Assignment conversations remain inspectable.
- Task-card circles represent assignment acceptance/progress, not legacy feedback work.
- Recurring templates continue producing independent new tasks.

## Todo

- [x] Unify pre-run and run-bound reply persistence/API; remove feedback/subtask creation.
- [x] Enforce one execution per task/assignment atomically, including queue/tools/scheduler;
      remove fresh-session recovery and provide explicit same-session continuation.
- [x] Build one task timeline/composer and retain assignment progress circles; remove rerun UI.
- [x] Update agent-facing descriptions and documentation.
- [x] Verify regressions, lint --fix, typecheck, design audit and browser E2E.

## Storage and portability

Reuse task assignments and reply storage. Pending pre-run replies have no run until
first dispatch binds them atomically. Runtime history is SQLite state; no new portable
configuration/assets are introduced. Workspace .gitignore needs no changes; existing
workspace .gitignore files will not be modified. Existing historical runs remain readable,
but no new independent executions may be added to an already-run task.

## Verification

- Backend, frontend, shared and CLI unit/integration suites exercised; stale assertions
  for removed behavior were updated and their suites rerun successfully.
- Final focused backend checks: 108 passing tests covering public API scheduling,
  task lifecycle, single-execution enforcement and scheduler behavior.
- Embedded SDK browser suite: 41 passing tests, followed by 21 passing task/Teams
  checks against the final UI, including pre-run input, queued chat replies, delegation,
  owner acceptance, repeat-start rejection and stop/Continue in the original session.
- Desktop/mobile browser suite: 176 passing tests across the suite and corrected
  smoke-test rerun; 56 tests skipped by the existing project conditions.
- Typecheck, ESLint --fix, design-system audit, unused-export check and frontend
  production build passed. No screenshot baselines added.
- Historical feedback/run records remain readable; feedback creation/edit endpoints
  and their input contracts were removed. Team assignments retain the existing
  internal storage instead of introducing another database structure.

## PR preparation

- [x] Simplify delegation instructions to describe automatic result delivery.
- [x] Verify wording changes.

The user authorized committing the completed feature and opening a PR from
`codex/teams` against `codex/opencode-v2-migration`.

## Live browser follow-up

### Delayed team handoff

- [x] Record redundant accepted-result notifications as handled; distinguish queued,
      delivering, delivered and cancelled notifications in the timeline.
- [x] Recover unaccepted worker results for terminal owners while excluding stopped,
      skipped and archived tasks; preserve idempotent delivery.
- [x] Test a worker finishing while its owner specialist runs another queued task,
      followed by automatic delivery into the original session after that task ends.
- [x] Document waiting behavior and manual long-worker testing; run focused tests,
      ESLint --fix, typechecks and design-system audit.

No database shape or portable workspace file changes are needed: followup status is
already stored as text. No workspace .gitignore changes or file migrations apply.

Verification: 96 backend execution tests, 13 timeline tests, 138 task-page/panel tests,
and 50 shared task-schema tests passed. Workspace typecheck, changed-file ESLint
--fix, design-system audit and diff whitespace check passed. The timeline test
fixture was corrected to supply the required needsHumanReview field. The delayed
handoff is proven with controlled SDK responses; the live-provider manual procedure
is prepared in `teams-delayed-handoff-e2e.md` and has not been run in this follow-up.

- [x] Make the task page/panel result summary select the owner execution, not a newer assignment.
- [x] Add regression checks, run ESLint --fix and tests, and verify the corrected live view.
- Live OpenAI checks passed for queued feedback, delegation/acceptance, green assignment
  indicators, refresh persistence, and stop/Continue retaining the original session.
- The summary correction passed 144 focused frontend tests and frontend typecheck;
  both corrected views were verified in the visible browser. The disposable reply
  intended for queue cancellation delivered before the cancel click, so manual
  cancellation of an individual queued reply was not verified in this walkthrough.
