# U4.6 File Upload Backend and Settings✅

## Goal

Add the backend and settings foundation for file and folder uploads in the file manager, including upload limits, dangerous-file policy, protected-file overwrite rules, and a stable upload API for the frontend.

## Why this is a separate PR

Upload touches backend validation, security policy, settings persistence, and filesystem semantics. It should land as infrastructure first so the file-manager UI can be built against a stable contract.

## Pre-Conditions

- U4.1 File Manager Navigation and CRUD is complete.
- The file manager root model is already established: `Workspace`, `All Agents`, `Host Filesystem`.
- CC settings persistence is available.

## Scope

### Upload Settings

- Add persistent settings for file upload behavior:
  - `fileUploads.maxUploadSizeBytes`
  - `fileUploads.allowDangerousFiles`
- Default `maxUploadSizeBytes` to `50 * 1024 * 1024` (50 MB).
- Default `allowDangerousFiles` to `false`.
- Expose these settings through the existing CC settings backend/UI contract so later UI work can consume them.

### Upload Policy

- Define a backend upload policy layer that validates uploaded files before writing them.
- Enforce max size using `fileUploads.maxUploadSizeBytes`.
- Deny dangerous file types by default.
- Dangerous-file detection should be based on filename/extension first, with room to grow later.
- Include common unsafe archive/executable/installable types such as:
  - `zip`, `rar`, `7z`, `tar`, `gz`
  - `exe`, `msi`, `dll`, `bat`, `cmd`, `sh`, `app`, `pkg`
  - disk-image formats such as `dmg`, `iso`
- If `fileUploads.allowDangerousFiles` is enabled, allow these files.

### Critical Paths and Overwrite Rules

- Critical CC-managed directories must remain uploadable.
- Critical status should continue to block rename/delete, but not block creating new files/folders inside those directories.
- However, uploads must not be allowed to overwrite protected CC-managed files that are required for application/runtime integrity.
- Distinguish between:
  - upload into critical directory: allowed
  - overwrite protected managed file: denied
- Protected managed files should include at minimum workspace/agent files already treated as critical and app-owned, such as:
  - workspace `opencode.jsonc`
  - agent `AGENTS.md`
  - agent `opencode.jsonc`
  - CC-managed `.opencode/` runtime files where overwrite would break agent state

### Upload API

- Add one backend upload endpoint that supports both file and folder upload flows.
- The endpoint should accept:
  - selected root
  - destination directory path
  - uploaded files
  - relative paths for folder uploads so directory structure is preserved
- Validate all destination paths to prevent traversal outside the selected root.
- Preserve relative directory structure for folder uploads.
- Define the first-version conflict policy as fail-on-conflict rather than silent overwrite.
- Return a structured result with:
  - uploaded entries
  - rejected entries
  - failure reasons

### Decisions

- Upload should be supported in both normal and critical directories.
- Protected files may not be overwritten even when their parent directory is uploadable.
- Upload size is configurable via settings, not hardcoded into the UI.
- Dangerous-file policy is configurable through a dedicated settings toggle.
- Backend should own all security and overwrite checks; frontend validation is helpful but not authoritative.

## Out of Scope

- Drag-and-drop upload UI.
- Upload progress rendering in the file manager.
- Fancy conflict-resolution UX such as replace/rename/merge dialogs.
- Background upload queueing across page reloads.

## Acceptance Criteria

- CC settings support `fileUploads.maxUploadSizeBytes` and `fileUploads.allowDangerousFiles`.
- Default upload limit is 50 MB.
- Dangerous files are rejected by default.
- Dangerous files are allowed when the setting is enabled.
- Uploads into critical directories succeed when paths are otherwise valid.
- Uploads that would overwrite protected CC-managed files are rejected.
- One backend upload endpoint supports both file and folder uploads.
- Folder uploads preserve relative directory structure.
- Path traversal outside the selected root is rejected.
- Name conflicts fail explicitly instead of silently overwriting files.

## Key Files to Create/Modify

- `packages/backend/src/routes/` upload endpoint(s)
- `packages/backend/src/services/` file-manager upload service and policy helpers
- `packages/backend/src/db/helpers.ts` / settings accessors if needed
- `packages/backend/src/db/schema/settings.ts` if settings structure changes need documentation or migration support
- `packages/shared/src/schemas/` upload request/response and settings schemas
- `packages/frontend/src/lib/api.ts` upload/settings client helpers
- `packages/frontend/src/pages/SettingsPage.tsx` or follow-up settings surface for the new controls

## Reference

- Parent epic: `development/product-ux-surfaces/04-file-manager-and-terminals.md`
- Dependency: `04-file-manager-and-terminals-sub-epics/01-file-manager-navigation-and-crud.md`
- Existing critical-path logic: `packages/backend/src/services/file-manager-service.ts`
