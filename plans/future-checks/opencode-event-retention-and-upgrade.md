# Recheck OpenCode Event Retention and Upgrade

**Status:** Pending upstream retention support and a verified OpenCode upgrade.
Authored 2026-08-21.

## Context

CommandsCenter currently pins `opencode-ai` and `@opencode-ai/sdk` to the
`1.17.20` release line. During the August 2026 OOM investigation, the managed
OpenCode database was approximately 730 MiB. Upstream reports that the OpenCode
`event` table can grow without retention or compaction, primarily through
retained message snapshots.

CommandsCenter must not prune or mutate OpenCode's database directly. Its
schema and retention semantics are owned by OpenCode, and CC cannot safely
infer which upstream records may be deleted.

Primary reference:

- [OpenCode issue #33356: unbounded `event` table growth](https://github.com/anomalyco/opencode/issues/33356)

At the time this note was authored, the latest published `opencode-ai` release
was `1.18.20`. A newer release alone is not sufficient reason to upgrade.

## Recheck Triggers

Reassess this check when any of the following occurs:

- OpenCode issue #33356 is resolved or documents a supported retention,
  compaction, or cleanup mechanism.
- A newer OpenCode release includes event-retention or database-growth changes.
- CC's managed OpenCode database shows material continued growth.
- CC otherwise plans an OpenCode or SDK dependency upgrade.

## Upgrade Checklist

1. Read the candidate OpenCode and SDK release notes, relevant upstream issues,
   and any documented database migration or retention behavior.
2. Test the candidate OpenCode and matching SDK versions against CC's focused
   orchestrator, provider, conversation, task-run, MCP, and session integration
   coverage.
3. Exercise representative conversations and task runs on a disposable test
   database, then compare event-row and database-size growth with the currently
   pinned release.
4. Verify startup, shutdown, restart recovery, directory-scoped disposal,
   provider authentication, pending questions and permissions, and MCP process
   lifecycle behavior.
5. Confirm the candidate does not require CC to modify OpenCode's private
   database schema or implement an unsupported cleanup routine.
6. Record any migration, compatibility, resource-use, or rollback implications
   in the upgrade pull request.
7. Run the project-required lint, typecheck, test, build, and relevant end-to-end
   suites before adopting the new release line.

## Completion Condition

Mark this check complete only after CC adopts a tested OpenCode release with
acceptable event-storage behavior, or records a new explicit decision to remain
on the current release and a future trigger for reassessment.
