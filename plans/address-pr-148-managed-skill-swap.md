# Address PR #148 managed-skill swap review

## Goal

Ensure a failed staged-directory rename cannot remove the previously installed CC-managed skill or leave staging data behind.

## Plan

- [x] Replace each managed skill through a temporary backup path instead of deleting the installed target first.
- [x] Restore the installed target when promoting the staged copy fails, and clean the staged copy on both success and failure.
- [x] Add a regression test that forces the staged promotion to fail and verifies the previous managed skill and manifest remain unchanged.
- [x] Run ESLint with fixes, focused tests, typecheck, the full test suite, and the high-severity dependency audit.
- [ ] Commit and push the fix, reply with verification evidence, and resolve the review thread.

## Success criteria

- A staged rename failure rejects the workspace update without deleting or modifying the installed managed skill.
- The managed-skill manifest remains unchanged after the failed update.
- No `.cc-staging-*` or `.cc-backup-*` directory remains after a recoverable failure.
- Existing local-skill preservation and managed-skill reconciliation tests continue to pass.
