# DSM-002 — Deepen Button and Input Adoption

- Status: Complete
- Program: [Design-System Maintenance](README.md)
- Foundation reference:
  [Compatibility API](../design-system-foundation.md#4-preserve-current-classes-as-a-compatibility-api)
- Canonical guidance:
  [Components and interaction ownership](../../docs/design-system/components.md)

## Goal

Move ordinary action and text-input call sites from direct `cc-button*` and
`cc-input` class consumption to the existing typed `Button` and `Input` APIs,
while explicitly retaining native elements where their semantics are the better
fit.

## Context

The existing primitives intentionally wrap the established compatibility
classes, so the visual source remains single-owned. The debt is not the presence
of raw `<button>` or `<input>` elements; it is repeated direct selection of the
compatibility API and reassembly of standard variants outside the primitive
owner. The implementation must therefore measure direct call-site ownership,
not merely global string totals or the number of UI imports.

## Scope

- After DSM-001 lands, inventory every production `cc-button`,
  `cc-button-secondary`, `cc-button-danger`, `cc-button-icon`, and `cc-input`
  consumer with element type, domain owner, behavior, visual modifiers, and
  migration decision.
- Classify each occurrence as:
  - ordinary action that should use `Button`;
  - ordinary text-like `<input>` that should use `Input`;
  - legitimate native/domain control that should remain native but stop using a
    compatibility class directly;
  - non-input use of `cc-input` such as `textarea`/`select`, handed to DSM-003;
  - composition or dynamic-class usage needing a focused migration; or
  - definition/test/documentation rather than a runtime consumer.
- Migrate by domain in reviewable batches. Preserve explicit `type="submit"`,
  refs, form association, names/values, disabled state, event ordering, and
  data-testid contracts.
- Use the primitive's existing variants and sizes. Add a variant only when at
  least one current consumer cannot express a supported visual role otherwise;
  include its immediate consumer and gallery/test coverage in the same batch.
- Replace compatibility-styled labels, links, or other action-like elements
  with semantic Tailwind composition or a proven common component. Do not force
  invalid element semantics through `Button`.
- Separate audit ownership for primitive-internal compatibility tokens from
  direct domain consumers. Ratchet each direct-consumer category downward to
  its accepted final count.
- Remove a compatibility definition only when its last runtime consumer,
  including the primitive owner, is intentionally migrated to semantic Tailwind
  classes and all visual tests pass.

## Required deliverables

- `artifacts/button-input-adoption-matrix.md` with exact post-DSM-001 counts,
  path/element classification, decisions, batch order, and final consumers.
- Migrated ordinary action and input call sites using typed CC-owned APIs.
- Focused tests for behavior-sensitive migrations and updated gallery examples
  for any new approved variant.
- Audit baselines that distinguish primitive-owned compatibility definitions
  from forbidden direct domain consumption.
- A final compatibility disposition for every targeted class family.

## Blockers and dependencies

- Blocked by: DSM-001.
- Blocks: DSM-003, which uses the adoption matrix to prove demand for Textarea,
  Select, Badge/Pill/Status, Tooltip, or another missing primitive.

## Acceptance criteria

- [x] Every targeted production occurrence is classified by exact path,
      element, owner, behavior, and final decision; dynamic class construction
      and non-element strings are accounted for.
- [x] Every ordinary button action uses `Button` with the correct primary,
      secondary, danger, or icon contract.
- [x] Every ordinary text-like input uses `Input` without losing native props,
      form behavior, refs, autofill, validation, or accessible labeling.
- [x] Remaining raw buttons/inputs have a documented semantic or domain reason;
      raw-element count alone is not treated as failure.
- [x] No domain call site directly consumes a targeted compatibility class
      unless it is explicitly handed to DSM-003 with a concrete missing-
      primitive requirement.
- [x] Submit/reset behavior is preserved explicitly; the `Button` default
      `type="button"` causes no silent form regression.
- [x] Icon-only controls retain accessible names and focus-visible behavior;
      disabled/loading controls retain their existing interaction contract.
- [x] Existing visual density, responsive layout, and Default light/dark states
      remain unchanged unless a separately approved product change exists.
- [x] The audit prevents any increase or reintroduction of direct domain
      compatibility consumers and reports the approved typed alternative.
- [x] No speculative variant, polymorphic API, or common abstraction is added
      solely to make migration counts reach zero.

## Completion evidence

- The frozen post-DSM-001 inventory classifies 342 targeted runtime records
  across 53 exact paths, including dynamic class construction, semantic
  link/label consumers, primitive-owned definitions, and the 28 concrete
  `select`/`textarea` handoffs to DSM-003.
- All 200 compatibility-styled button actions now use `Button` except the
  documented compact activity action, which remains a native link-like button
  and obtains its non-compact appearance from `buttonVariants`. Both dynamic
  live-request consumers now receive typed `Button` props.
- All 64 ordinary domain inputs now use `Input`; all 38 semantic links and
  labels retain their native element and use `buttonVariants`.
- Domain code has zero direct button-compatibility consumers and zero ordinary
  `cc-input` consumers. The audit permits only primitive ownership and the 28
  exact DSM-003 `select`/`textarea` handoffs, with negative tests for
  reintroduction and growth.
- ESLint fix, root/package linting, formatting, typecheck, Knip, production
  build, design-system audit, and the complete unit/integration suite pass. The
  design-system Playwright selection passes twice (44 passed and 44 intentional
  mobile-project skips per run); full E2E passes with 150 passed and the same 44
  intentional skips.

## Verification tests

- Reproduce literal, JSX-attribute, `cn`/template, and dynamic consumer counts
  before and after every batch.
- Run focused form tests covering submit, cancel, Enter, disabled, validation,
  file upload labels, refs, and programmatic focus where applicable.
- Verify representative primary/secondary/danger/icon buttons and input states
  in Default light/dark and narrow/wide layouts.
- Run `pnpm exec eslint . --fix`, `pnpm lint`, `pnpm typecheck`, affected tests,
  full unit/integration tests, the design-system Playwright project twice,
  `pnpm test:e2e`, `pnpm knip`, and `pnpm design-system:audit`.
- Build production and search for retired compatibility names only when their
  definitions are actually removed.

## Out of scope

- Replacing every raw native button or input.
- Creating Textarea, Select, Tooltip, or Badge/Pill/Status without the DSM-003
  consumer gate.
- Redesigning forms, button hierarchy, or validation behavior.
- Moving domain-specific controls into `components/ui` solely because they use
  a button element.
