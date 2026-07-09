# Chat Results Artifact Path Fix

## Goal

Fix chat result artifacts that point at specialist-local files but open or
publish as if they were global workspace files.

## Root Cause

Some chat artifacts are registered as `type = "file"` with links such as
`references/tool-list.md`, while the real file lives in the specialist private
documents folder:

`workspace/specialists/<slug>/Documents/references/tool-list.md`

The shared result UI can already consume a precise `fileManagerPath`; the chat
artifact API was returning a best-guess path that skipped `Documents/`.

## Tasks

1. Resolve `file` artifact file-manager paths by checking:
   - `specialists/<slug>/<link>`
   - `specialists/<slug>/Documents/<link>`
   - global workspace `<link>`
2. Publish file artifacts from the same candidate roots.
3. Add backend service coverage for specialist `Documents` file artifacts.
4. Keep frontend chat result coverage on the resolved `Documents` path.
5. Run lint, typecheck, and targeted tests before commit.
