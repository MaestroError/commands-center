# Workflow Enforcement Record

- Local command: `pnpm design-system:audit`.
- CI placement: `Static Checks`, immediately after dependency installation and
  before lint/format/typecheck.
- Release placement: `pnpm release:check` uses the identical command.
- Runtime: approximately 0.25 seconds including all 15 audit tests.
- Dependencies: Node standard library only; no network or runtime services.
- Failure parity: local and CI invoke the same package script, implementation,
  configuration constants, and fixtures.
- ESLint remains the sole owner of direct Radix import enforcement.
- lint-staged/pre-push integration is intentionally omitted: the full audit is
  repository-wide and unrelated staged files already receive ESLint/Prettier;
  CI and release checks provide the deterministic gate without hook duplication.

Representative negative output includes a `DS00N` ID, exact path/match,
approved alternative, documentation path, and nonzero status.
