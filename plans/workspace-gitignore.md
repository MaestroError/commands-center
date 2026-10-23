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

## Search review follow-up

- [x] Reproduce Git ignore rules hiding private workspace content from app search.
- [x] Disable VCS ignore handling in CC text search while retaining explicit runtime/dependency exclusions.
- [x] Test workspace and specialist search roots with Git initialized and seeded ignore rules.
- [x] Clarify generated opencode.jsonc credentials and Git backup implications; retain active rules because CC emits literal internal MCP tokens.
- [x] Run lint, types and relevant tests, update PR and request Copilot review again.

Search review verification: regression reproduced before the fix; all 22 text-search
and workspace bootstrap/ignore tests pass after it. Git ignores no longer affect
app search; explicit runtime exclusions and search-specific ignores remain effective.

## Expanded delivery scope

The operator requested that internal CC tools move from MCP to direct SDK tools
in this same PR, together with commented-out opencode.jsonc ignore rules. See
[embedded-cc-tools.md](embedded-cc-tools.md) for the proposed implementation and
acceptance plan. The current active exclusions remain until that work is complete.
