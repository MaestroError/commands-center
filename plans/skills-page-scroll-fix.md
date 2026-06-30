# Skills Page Scroll Fix

## Goal

Make the skills library card container scroll correctly on both desktop and mobile.

## Todo

- [x] Inspect the skills page and shared workspace layout to confirm which container blocks overflow.
- [x] Update the skills page primary pane structure so the skill cards have an explicit scroll container inside `WorkspaceLayout`.
- [x] Add or update a frontend regression test for the scrollable skills pane structure.
- [x] Attempt to run `eslint --fix` and the relevant frontend tests to verify the change.

## Verify

- Open the skills page on desktop and mobile layouts and confirm the skills list scrolls.
- Run `pnpm eslint --fix`.
- Run the relevant frontend tests for the skills page.

## Verification Notes

- `pnpm --filter @cc/frontend lint -- --fix src/pages/BuiltInSkillsPage.tsx src/pages/BuiltInSkillsPage.test.tsx` failed because `eslint` is unavailable in this checkout (`node_modules` is missing).
- `pnpm --filter @cc/frontend test -- src/pages/BuiltInSkillsPage.test.tsx` failed because `vitest` is unavailable in this checkout (`node_modules` is missing).
