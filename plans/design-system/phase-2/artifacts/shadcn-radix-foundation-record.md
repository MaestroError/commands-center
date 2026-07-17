# Shadcn/Radix Foundation Record

- Task: [DS-0202](../02-shadcn-radix-foundation.md)
- Phase: [Phase 2](../README.md)
- Contract: [batch-1-contract.md](batch-1-contract.md)
- Status: Complete

## Stack targeted

Vite 6, React 19, strict TypeScript, Tailwind v4 (CSS-native, `@import "tailwindcss"`
in `src/styles/globals.css`, no `tailwind.config`), `@/*` → `./src/*` alias.

## Dependencies added (direct, frontend package)

| Package                    | Version | Purpose                                 |
| -------------------------- | ------- | --------------------------------------- |
| `clsx`                     | ^2.1.1  | Conditional class composition for `cn`. |
| `tailwind-merge`           | ^3.6.0  | Tailwind conflict resolution for `cn`.  |
| `class-variance-authority` | ^0.7.1  | Typed Button variant selection.         |

`radix-ui` (^1.6.2) was on the DS-0201 allowlist and was **deferred** at DS-0202
until its first concrete consumer, then added when the Dialog and AlertDialog
primitives (DS-0204/DS-0205) were implemented. The import-boundary rule below was
in place before it landed, so Radix imports are confined to `components/ui/` from
the outset.

No equivalent to any of these already existed (confirmed in DS-0201).

## Files added

- `src/lib/cn.ts` — single `cn(...inputs)` export (`twMerge(clsx(inputs))`).
- `components.json` — copy-owned Shadcn config for the existing stack:
  `tsx: true`, `tailwind.config: ""` (v4 has no config file),
  `tailwind.css: src/styles/globals.css`, aliases `components → @/components`,
  `ui → @/components/ui`, `lib → @/lib`, `utils → @/lib/cn`, `iconLibrary: lucide`.

## Rejected Shadcn defaults

- No generated palette / CSS color variables (CC's semantic tokens are the source
  of truth).
- No second Tailwind config, reset, base-style block, radius scale, or font.
- No animation package (e.g. `tailwindcss-animate`).
- No barrel/index file or default exports; primitives use named exports.
- `baseColor`/`cssVariables` in `components.json` are inert CLI metadata; no
  palette was written to `globals.css`.

## Import boundary (enforced)

`eslint.config.ts` adds `no-restricted-imports` banning `radix-ui`, `radix-ui/*`,
and `@radix-ui/*` for `packages/frontend/src/**`, then turns the rule off for
`packages/frontend/src/components/ui/**`.

Verified by probe:

- A `radix-ui` import in `src/__boundary_probe.ts` → **error** (`no-restricted-imports`).
- The same import in `src/components/ui/__boundary_probe.ts` → **allowed**.

Both probe files were removed after verification.

## Verification

- `pnpm --filter @cc/frontend exec vitest run src/lib/cn.test.ts` — passed (5 cases:
  falsey inputs, object/array inputs, conflicting utilities, non-conflicting
  utilities, consumer override).
- `pnpm --filter @cc/frontend typecheck` — passed.
- `pnpm --filter @cc/frontend lint` — passed.
- Radix import-boundary probe — passed (see above).

## Acceptance criteria

- [x] Shadcn config targets the existing stack and Radix base; no second Tailwind
      config.
- [x] Only approved direct dependencies added (subset needed so far; `radix-ui`
      deferred to its first consumer).
- [x] `cn` composes conditional classes and resolves Tailwind conflicts.
- [x] No Shadcn palette, generic theme names, reset, font, animation package, or
      duplicate radius scale added.
- [x] Radix imports restricted to `components/ui/` (enforced + probe-verified).
- [x] Named exports and existing alias/import conventions used.
- [x] No component branches on theme id or resolved color mode.
- [x] Existing production `cc-*` consumers untouched.
