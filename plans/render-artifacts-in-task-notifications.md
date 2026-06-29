# Render Artifacts In Task Notifications

## Assumptions

- Task completed and task needs review activities should display task run artifacts inline.
- Activity payload JSON can carry a snapshot of artifacts without a schema migration.
- Artifact titles remain the user-facing link labels; links/paths stay visible as metadata.

## Tasks

- [x] Include artifacts in `task_completed` activity payloads.
- [x] Include artifacts in `task_needs_review` activity payloads.
- [x] Render artifacts in matching activity cards when not compact.
- [x] Add backend and frontend regression tests.
- [x] Run `eslint --fix` and relevant tests, then update the PR branch.
