# Workspace Preferences Configuration Migration

## Assumptions

- `workspace/mcp/` is unused and can stop being created/protected.
- Preference files are CC-owned and can move from `workspace/preferences/` to `workspace/configuration/preferences/`.
- Existing workspaces may have old preference files, new preference files, both, or neither.

## Todo

1. [x] Update runtime config so `preferences` resolves under `configuration/preferences` and remove the `mcp` default subdirectory.
   - Verify with runtime config/path tests.
2. [x] Update file-manager critical path rules to stop protecting the unused `mcp/` folder and protect the new preferences path.
   - Verify with existing file-manager route/service tests.
3. [x] Add filesystem migration `0008-move-preferences-under-configuration`.
   - Verify old, current, rerun, conflict, and rollback behavior.
4. [x] Run lint with `eslint --fix` and focused tests, then broader tests if feasible.
