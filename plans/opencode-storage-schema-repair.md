# OpenCode Storage Schema Repair

## Goal

Fix existing OpenCode SQLite databases that have `session_context_epoch` marked
as migrated but are missing columns required by the bundled OpenCode runtime.

## Tasks

1. Add a narrow compatibility repair for `session_context_epoch`.
2. Run the repair before spawning OpenCode.
3. Cover missing, already-current, absent-table, and custom `OPENCODE_DB` cases.
4. Verify with lint, typecheck, and focused tests.
