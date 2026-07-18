# Remove Playwright Screenshot Baselines

- Status: Complete
- Parent: [CC Design System Foundation](../design-system-foundation.md)

## Goal

Remove platform-specific committed Playwright screenshots and preserve their
useful coverage through deterministic semantic, computed-style, responsive
layout, focus, and interaction assertions.

## Context

The repository contains 37 macOS Chromium PNG baselines. CI runs Playwright in
a Linux container, so the default platform-specific snapshot naming does not
provide a reliable shared comparison contract. Binary updates are also noisy
for routine design-system changes.

## Tasks

1. Inventory every `toHaveScreenshot` call and committed E2E baseline PNG.
2. Replace application and content snapshots with theme-role, visibility,
   focus, and horizontal-containment assertions.
3. Replace primitive/common gallery snapshots with overlay-role, semantic
   surface, focus, and responsive-containment assertions.
4. Delete all committed Playwright baseline PNGs and obsolete screenshot
   helpers.
5. Update design-system documentation so future phases prefer deterministic
   assertions and manual review instead of committed pixel baselines.
6. Run focused suites twice, the full E2E suite, lint, typecheck, formatting,
   and residual searches.

## Acceptance criteria

- [x] No `toHaveScreenshot` assertion remains under `packages/frontend/e2e`.
- [x] No committed PNG remains under an E2E `*-snapshots` directory.
- [x] Light and dark theme application is asserted on every former baseline
      surface.
- [x] Narrow layouts and overlays retain explicit overflow/containment checks.
- [x] Protected Markdown behavior and generic semantic HTML remain covered.
- [x] Primitive/common keyboard, focus, dismissal, and state contracts remain
      covered.
- [x] Focused tests pass twice and the full E2E suite passes.
- [x] ESLint, typecheck, scoped Prettier, and `git diff --check` pass.

Repository-wide Prettier checks remain blocked only by the unrelated nested
worktree file `.claude/worktrees/gallant-saha-0521b4/packages/frontend/src/pages/TasksPage.tsx`.
All files changed by this task pass Prettier.

## Verification

```bash
rg -n "toHaveScreenshot" packages/frontend/e2e
rg --files packages/frontend/e2e | rg "snapshots/.*\\.png$"
pnpm --filter @cc/frontend exec playwright test e2e/design-system --project=chromium
pnpm --filter @cc/frontend exec playwright test e2e/design-system --project=chromium
pnpm test:e2e
pnpm lint
pnpm typecheck
```
