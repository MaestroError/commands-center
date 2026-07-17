# Specialist Migration Record (DS-0403)

- Task: [DS-0403](../03-specialists.md)
- Scope: specialist list/editor behavior retained; appearance changes were confined to `SpecialistForm.tsx`.

## Decisions and deltas

- Raw palette occurrences: **34 → 0**.
- Permission choices map `disabled/deny → danger`, `ask/needs auth → warning`, and `allow/connected/matching → success`.
- Tool drift maps `matching → success`, `outdated → warning`, and `modified → danger`; unknown and source-only states remain neutral.
- Existing CC-owned `Switch`, `SearchableSelect`, and page-state compositions remain the control path. Native controls remain native.
- No schema, provider/model/tool state, mutation, query invalidation, navigation, or persistence code changed.

Verification is owned by the existing specialist component suite and `e2e/specialists.spec.ts`, plus the Phase 4 full gate.
