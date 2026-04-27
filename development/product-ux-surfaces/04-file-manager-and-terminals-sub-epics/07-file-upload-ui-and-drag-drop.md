# U4.7 File Upload UI and Drag-and-Drop✅

## Goal

Add the file-manager upload experience: one upload trigger that supports both file and folder uploads, a drag-and-drop upload area below breadcrumbs, upload progress, clear messaging about folder support, and the same drag-and-drop affordance directly inside the files list.

## Why this is a separate PR

This is the frontend/product layer on top of the upload backend. It introduces new UX in the file manager and should be implemented against the backend/settings contract from U4.6.

## Pre-Conditions

- U4.6 File Upload Backend and Settings is complete.
- U4.1 File Manager Navigation and CRUD is complete.
- The breadcrumb/header row already preserves right-side action space for global file-manager actions.

## Scope

### Dependency

- Install and use `react-dropzone` for drag-and-drop and click-to-pick upload behavior.
- Do not build a custom drag-and-drop implementation from scratch.

### Upload Actions

- Add a single upload entry point in the file manager action area rather than separate permanent buttons for file and folder upload if the UI can support both cleanly.
- The upload entry should allow choosing:
  - file upload
  - folder upload
- Keep this action on the right side of the breadcrumb/action row.

### Upload Panel

- Clicking the upload action should open an upload section directly below the breadcrumbs.
- The upload panel should support both modes:
  - upload files
  - upload folder
- Clicking the panel should open the relevant picker.
- Dragging files/folders onto the panel should upload directly when supported by browser APIs and `react-dropzone` integration.
- The panel copy should explicitly state that folders are supported, so the user understands drag-and-drop is not file-only.

### Files List Drop Target

- The current folder file list itself must also behave as a drop target, not just the upload panel below breadcrumbs.
- Users should be able to drag files or folders directly from the host system into the visible files list and start an upload without needing to target the breadcrumb-area panel first.
- The files-list drop target should still upload into the currently open folder.
- The files list should show clear drop-target affordance/copy so the behavior is discoverable even when the upload panel is collapsed.

### Picker Behavior

- File upload mode should open a normal file picker.
- Folder upload mode should open a directory picker and preserve relative folder structure.
- If a unified picker experience is feasible without harming clarity, it may be used, but the panel must still make it obvious that both files and folders are supported.

### Validation and Errors

- Reflect backend-driven validation results for:
  - max upload size
  - dangerous files policy
  - protected-file overwrite denial
  - name conflicts
- Surface rejections per file where possible.
- The UI may perform preflight checks for obvious issues, but backend results remain authoritative.

### Upload Progress

- Show visible upload progress/state in the upload panel.
- At minimum, the user should see:
  - uploading state
  - current batch progress summary
  - success/failure summary after completion
- Refresh the current directory listing after successful upload.
- Keep the user in the same folder after upload completes.

### Decisions

- Use one upload button/entry point if possible, not two permanent buttons.
- The drag-and-drop area belongs below breadcrumbs so it is obviously scoped to the current directory.
- The drag-and-drop area must mention folder upload explicitly.
- The files list is also a valid drop surface for the same current-directory upload action.
- Uploads into critical directories remain allowed; blocked cases come from backend policy, not the UI alone.

## Out of Scope

- Rich overwrite-resolution flows beyond showing failure results.
- Background upload manager across app surfaces.
- Upload preview thumbnails before submission.
- File editor integration after upload, beyond refreshing the current folder.

## Acceptance Criteria

- `react-dropzone` is installed and used for the upload interaction.
- The file manager has one upload entry point in the breadcrumb/action row if that remains practical in implementation.
- Clicking the upload action opens a drag-and-drop section below breadcrumbs.
- The upload section clearly communicates that both files and folders can be uploaded.
- Clicking the upload section opens the picker.
- Dropping files/folders onto the section uploads them.
- Dragging files/folders directly into the files list also uploads them into the current folder.
- Upload progress/state is visible during upload.
- Upload validation failures are surfaced clearly.
- Successful uploads refresh the current folder contents without navigating away.

## Key Files to Create/Modify

- `packages/frontend/package.json` add `react-dropzone`
- `packages/frontend/src/pages/FileManagerPage.tsx`
- `packages/frontend/src/components/workspace/` upload panel/action components
- `packages/frontend/src/lib/api.ts`
- `packages/frontend/src/pages/SettingsPage.tsx` only if the settings controls are included in the same implementation window

## Reference

- Parent epic: `development/product-ux-surfaces/04-file-manager-and-terminals.md`
- Dependency: `04-file-manager-and-terminals-sub-epics/06-file-upload-backend-and-settings.md`
- Dependency: `04-file-manager-and-terminals-sub-epics/01-file-manager-navigation-and-crud.md`
