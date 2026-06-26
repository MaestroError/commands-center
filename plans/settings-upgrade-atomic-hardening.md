# Plan: Settings Upgrade Atomic Hardening

## Problem

The Settings "Apply upgrade" button uses `SystemVersionService.update()`, which runs a raw global npm install. It bypasses the safer installer path added for atomic upgrades. On the VPS, failed/concurrent npm global installs left stale npm staging directories such as `/usr/lib/node_modules/.commandscenter-2Cv4iPVb`, then later upgrades failed with `ENOTEMPTY` and could leave `/usr/bin/ccenter` missing.

## Assumptions

- Settings upgrades and `ccenter upgrade` should share the same safe behavior.
- The installer can remain the most complete path for Node provisioning and systemd setup.
- The app should not try to remove npm staging directories automatically without a lock and clear ownership of the npm prefix.
- A failed upgrade must leave the current binary available, or restore the previously installed version.

## Implementation Tasks

1. Add an upgrade single-flight guard.
   - Ensure only one update or rollback can run at a time in a process.
   - Return a clear "upgrade already in progress" result instead of spawning another npm process.
   - Verify with a unit test that concurrent `update()` calls execute one npm install at most.

2. Add npm-global preflight checks.
   - Check current Node major against the target package `engines.node` before mutation.
   - Parse only lower-bound-like engine tokens and ignore pure upper-bound ranges.
   - Refuse with a clear message if Node is too old.
   - Detect stale `/usr/lib/node_modules/.commandscenter-*` style staging directories and refuse with cleanup guidance before running npm.
   - Verify with unit tests for Node mismatch and stale staging directory refusal.

3. Add binary verification after update and rollback.
   - Reuse npm-global preflight checks before rollback installs too, so rollback refuses stale npm staging directories or unsupported Node targets before mutation.
   - After `npm install -g commandscenter@target`, run `ccenter --version`.
   - Confirm the version matches the target when practical.
   - If verification fails, attempt rollback to the previous installed version.
   - Verify with unit tests for rollback preflight refusal and install success but missing/broken binary.

4. Add rollback on npm install failure.
   - Snapshot the current version before mutation.
   - If update install fails, run `npm install -g commandscenter@previousVersion`.
   - Verify `ccenter --version` after rollback.
   - Return clear failure details without scheduling restart.
   - Verify with unit tests for failed update restoring previous version.

5. Improve user-facing Settings response.
   - Return actionable instructions for Node mismatch, stale npm staging directories, failed rollback, and installer-only recovery.
   - Include stdout as a fallback when a captured command fails without stderr output.
   - Keep Docker guidance unchanged.
   - Verify route tests still pass with the update result schema.

6. Update docs.
   - Document that Settings upgrades now preflight and may refuse with cleanup commands.
   - Mention the installer remains the preferred repair path when the global npm prefix is corrupted.

## Verification

- `pnpm --filter @cc/backend test -- system-version-service`
- `pnpm --filter @cc/backend test -- routes/system`
- `pnpm --filter commandscenter test`
- `pnpm lint --fix`
- If changes touch shared schemas: `pnpm typecheck`

## Out Of Scope

- Replacing npm global installs with a full package-manager-independent deployment system.
- Automatically deleting stale npm staging directories from inside the running app.
- Modifying historical npm logs or systemd state on existing VPS machines.
