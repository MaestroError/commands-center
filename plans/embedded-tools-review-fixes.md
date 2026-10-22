# PR 213 review fixes

- [x] Initialize assigned specialist MCP inventory before snapshotting; keep validation/execution passive.
- [x] Parse migration inputs as JSONC; retain original rollback text.
- [x] Write credential-bearing migration files atomically with mode 0600 from creation.
- [x] Preserve task legacy MCP overrides when initializing the editor matrix.
- [x] Validate against effective default assignee, including assignee changes.
- [x] Normalize legacy Ask on internal task/template duplication.
- [ ] Run focused regression tests, ESLint --fix, and typechecks; push and request Copilot review.

No workspace gitignore changes needed: existing migration backup exclusions cover these files. Never update live workspace gitignore files.

Validation: 95 backend tests and 9 component tests passed; ESLint --fix and all package typechecks passed. JSONC parser approved by operator.
