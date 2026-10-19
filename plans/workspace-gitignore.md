# Default workspace .gitignore

Source: TickTick task `79124576b9eaeaba29ead132` (Add default .gitignore).

Only seed a default when CC creates the workspace root directory. Existing
folders, including empty folders, receive no file. Existing or deleted ignore
files are never repaired, replaced, or migrated on later starts. Users own the
file after initialization.

- [x] Add the initial ignore rules for credentials, runtime data, private content,
      specialist playgrounds, generated files, caches and local secrets.
- [x] Seed the file during new workspace root creation only.
- [x] Test lifecycle behavior and real Git matching, including portable assets
      that should remain trackable.
- [x] Document the tracked-files limitation and add a short AGENTS.md note:
      assess ignore rules for filesystem changes; no migrations for this file.
- [x] Run ESLint --fix, typechecks and relevant backend/CLI tests.

The rules include v2 runtime state under /.cc/ in addition to the task's list.
No git initialization, index changes, or changes to live workspace files.

## Verification

- Backend: 1,685 tests passed. CLI: 45 tests passed.
- All package typechecks, targeted ESLint --fix and formatting checks passed.
- Real Git checks verify ignored private/runtime paths and trackable portable assets.
- No migration, existing workspace updates, commits or pushes performed.

## PR review follow-up

- [x] Ignore root and specialist opencode.jsonc files, including archived specialists.
- [x] Ignore only generated .opencode/cc-tools wrappers; retain local skills/tools.
- [x] Extend real Git regression checks, update documentation, and run lint/tests.

Review regression: the expanded Git check failed before the rule changes and
passed afterward. All 8 bootstrap/ignore tests, ESLint and formatting passed.
