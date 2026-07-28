# Recheck ESLint `brace-expansion` Advisory

**Status:** Pending upstream remediation. Authored 2026-07-28.

## Context

`GHSA-mh99-v99m-4gvg` reports an unbounded-expansion denial of service in
`brace-expansion`. CommandsCenter's remaining legacy v1 copy is inherited
through ESLint's development-only `minimatch@3` dependency chain.

Forcing `brace-expansion@5` into packages designed for v1 is not considered a
safe remediation. The dependency-security update may therefore temporarily add
this GHSA to `pnpm.auditConfig.ignoreGhsas` after all runtime and v5 paths have
been upgraded to patched versions.

## Recheck Trigger

Recheck this exception:

- on every ESLint or `typescript-eslint` upgrade;
- when either dependency updates its `minimatch` dependency;
- before the next CommandsCenter release after 2026-09-01; and
- whenever `pnpm audit` changes the affected or patched version range.

## Removal Checklist

1. Run:

   ```sh
   pnpm why brace-expansion -r --depth 6
   ```

2. Confirm no `brace-expansion` version covered by
   `GHSA-mh99-v99m-4gvg` remains.
3. Remove `GHSA-mh99-v99m-4gvg` from `pnpm.auditConfig.ignoreGhsas`.
4. Run:

   ```sh
   pnpm audit --audit-level=high --ignore-registry-errors
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

5. Delete or mark this check complete after the audit passes without the
   exception.
