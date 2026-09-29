# Archived Task Detail Implementation Plan

## Goal

Allow archived task cards and direct archived task URLs to load the existing full task detail while limiting archived records to restore, delete, and read-only inspection.

## Approach

1. Opt the existing task detail route into `TaskService.get(..., { includeArchived: true })`. The service continues to exclude soft-deleted and unknown rows, while mutation routes retain their existing active/archive policies.
2. Treat `task.archived` as the frontend read-only boundary. Replace active header actions with Restore and confirmed Delete, disable title and acceptance-criteria editing, and suppress feedback, run-reply, artifact-share, and chat-continuation mutations while preserving detail, history, results, artifacts, and inspection links.
3. Preserve `location.search` for archive back-navigation. After restore, navigate to the task's normal active detail URL; after delete, navigate back to the preserved task-list view.
4. Extend route, component, and task E2E fixture coverage for archived retrieval, complete read-only detail, restore, delete, active-task preservation, and true not-found behavior.

## Verification

- Focused backend task route tests.
- Focused frontend task detail tests.
- Formatting, lint, type checking, knip, design-system audit, builds, and package test suites.
- Playwright task E2E only when a usable configured or system Chromium/Chrome executable is available; otherwise record the local skip and rely on CI E2E.

## Constraints

- No schema, migration, dependency, retention, or soft-delete changes.
- Archived tasks remain non-editable and non-runnable in place.
- Active task detail behavior remains unchanged.
