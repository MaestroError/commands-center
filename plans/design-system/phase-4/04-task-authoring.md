# DS-0404 — Migrate Task Authoring and Template Flows

- Status: Complete ([record](artifacts/task-authoring-migration-record.md))
- Phase: [Phase 4](README.md)
- Foundation reference:
  [domain migration approach](../../design-system-foundation.md#phase-4--migrate-domain-ui-incrementally)

## Goal

Migrate task creation, editing, scheduling, template management, and prompt
authoring surfaces to approved CC primitives and semantic roles without changing
task definitions or composer behavior.

## Context

Task authoring spans task forms, template forms/lists/dialogs, scheduling,
attachments, prompt controls, page states, and many repeated actions/fields.
Composer mention/file/slash suggestion behavior is explicitly domain-specific
and must retain textarea focus and insertion semantics.

## Scope

- Migrate task form, template form/list/view, scheduling, and directly owned
  authoring components identified by DS-0401.
- Compose approved Button, Input/Textarea, Surface, Alert, Badge/Status, Dialog,
  and common APIs where behavior matches.
- Keep native select/checkbox/radio controls native unless the matrix approves a
  custom control.
- Replace theme-dependent raw warning/success/danger/progress classes with
  semantic roles.
- Replace equivalent inline UI SVGs with Lucide.
- Preserve prompt textarea focus, mention/file/slash insertion, attachments,
  validation, recurrence/schedule state, template conversion, mutations,
  navigation, and portable task definitions.

## Required deliverables

- Migrated authoring/template files with focused tests.
- E2E coverage for create/edit/template/schedule/prompt attachment flows.
- Light/dark, narrow/wide authoring baselines including validation/error/pending
  states.
- `artifacts/task-authoring-migration-record.md` with file ownership, palette/
  icon deltas, native-control decisions, composer exclusions, and behavior
  results.

## Blockers and dependencies

- Blocked by: DS-0401 and required Phase 3 fields/page states/tabs.
- Blocks: DS-0405, DS-0410, DS-0411, and DS-0412.

## Acceptance criteria

- [x] Task/template create, edit, validate, schedule, duplicate, and navigation
      behavior remains unchanged.
- [x] Prompt content, attachments, mentions, slash commands, focus ownership,
      and insertion semantics remain domain-controlled and covered.
- [x] Mutation payloads, query state, portable task/template files, and scheduler
      semantics are untouched.
- [x] Repeated controls use approved CC APIs and native controls remain native
      where classified.
- [x] Theme-dependent states use semantic roles in both modes; product progress
      roles are explicitly classified.
- [x] Equivalent UI glyphs use Lucide without changing accessible names.
- [x] No direct Radix import or business-logic refactor is introduced.
- [x] Dense/narrow forms and dialog actions remain usable without overflow.

## Verification tests

- Run task/template form and composer-focused unit/component tests.
- Run authoring E2E flows for new/edit/template/schedule/attachment/error cases.
- Verify keyboard focus through fields, popovers, dialogs, and action groups.
- Review Default light/dark at desktop/390px and rerun owned inventory counts.

## Out of scope

- Replacing composer suggestion popovers with generic Radix Popover.
- Changing task schemas, scheduler behavior, persistence, or API payloads.
- Task board/run/detail visualization, which DS-0405 owns.
