# Specialist AGENTS.md and instructions save plan

## Scope

Implement these TickTick tasks together in one branch and pull request:

- `6a551976a3b671d1214d8fc6` — stop adding the generated workspace-boundaries section to a specialist's `AGENTS.md`.
- `6a54c4dcecda110521319c2a` — make the Rewrite AGENTS.md control visibly usable and add a save action next to the instructions.

Suggested branch: `codex/fix-specialist-agents-instructions`

No database or filesystem migration is required. Existing specialist workspaces must not be rewritten automatically; their `AGENTS.md` files remain unchanged until the operator explicitly enables Rewrite AGENTS.md and saves.

## Confirmed current behavior

- `renderOpenCodeWorkspace()` currently generates `AGENTS.md` with the specialist title, role, a `## Workspace Boundaries` section, and `## Instructions`.
- The shared PATCH schema already accepts `rewriteAgentsMd`, defaulting to `false`.
- The specialist service already passes that flag to `prepareWorkspace()` as `writeRules`, preserving manual `AGENTS.md` edits by default and regenerating the file when opted in.
- The editor already stores `rewriteAgentsMd` in form state and includes it in the full update payload.
- The current Rewrite AGENTS.md UI is a small switch aligned at the far right of a wide row, while the only save action is below the entire specialist form.

## Assumption to confirm during review

The dedicated instructions save action will be a second `Save changes` submit button placed beside the instructions/rewrite controls. It will reuse the existing full-form submit handler and validation, so both save buttons have identical semantics and payloads. It will not introduce a partial instructions-only PATCH flow.

## Implementation tasks

1. Remove generated workspace boundaries
   - Update `packages/backend/src/opencode/workspace-contract.ts` so `rulesMarkdown` contains only the specialist heading, role, and `## Instructions` content.
   - Keep `parseRulesMarkdown()` and the rest of the workspace contract unchanged because they already parse the remaining structure.
   - Do not add a migration or rewrite existing workspaces. New specialists receive the new template; existing specialists receive it only after an explicit rewrite.
   - Verify with contract/service tests that newly rendered `AGENTS.md` does not contain `## Workspace Boundaries` or its explanatory sentence and still parses the title, role, and instructions.

2. Make Rewrite AGENTS.md a visible, accessible checkbox
   - Update the edit-only instructions area in `packages/frontend/src/components/specialists/SpecialistForm.tsx` to use a clearly visible checkbox/checkmark associated with the `Rewrite AGENTS.md` label.
   - Keep it off by default and continue updating `SpecialistFormState.rewriteAgentsMd` through the existing `onChange` path.
   - Use theme-backed classes such as border, surface, accent, focus-ring, and text tokens; do not add a hard-coded component color or a new dependency.
   - Keep the warning that enabling it overwrites manual `AGENTS.md` edits.

3. Add the nearby save action without duplicating save logic
   - Add an optional instructions-area action slot or similarly small prop to `SpecialistForm`; render it only from `SpecialistEditorPage` in edit mode.
   - Supply a themed `Save changes` submit button from `packages/frontend/src/pages/SpecialistEditorPage.tsx`, using the same pending/disabled state as the existing bottom button.
   - Route both buttons through the existing `handleSubmit()` so validation, collision confirmation, error display, navigation, and payload construction remain single-sourced.
   - Confirm that the request made from the nearby button includes the current `instructions` and `rewriteAgentsMd` value. No backend contract changes are needed for this flag.

4. Extend focused automated coverage
   - In `packages/backend/test/opencode/workspace-contract.test.ts`, assert the rendered rules omit the workspace-boundaries section while retaining valid title, role, and instructions.
   - In `packages/backend/test/services/specialist-service.test.ts` or `packages/backend/test/services/specialist-file.test.ts`, cover the observable create/rewrite behavior without combining unrelated behaviors in one test.
   - In `packages/frontend/src/pages/SpecialistEditorPage.test.tsx`, assert the checkbox is unchecked initially, becomes checked when clicked, and that the nearby save action sends `rewriteAgentsMd: true`. Keep each `it()` focused on one behavior.
   - Extend `packages/frontend/e2e/specialists.spec.ts` so the edit flow can see and select Rewrite AGENTS.md, use the nearby save action, and verify the PATCH request body carries the checked value.

5. Verify the combined change
   - Run ESLint with fixes on all touched TypeScript/TSX files: `pnpm exec eslint --fix <touched files>`.
   - Run `pnpm typecheck`.
   - Run focused frontend and backend tests while iterating, then the required full suite with `pnpm test`.
   - Run `pnpm test:e2e`.
   - Run `pnpm format` and fix any formatting failures.
   - Review the diff to ensure only the renderer, specialist instructions UI, tests, and this plan changed.

## Acceptance criteria

- Creating a specialist generates an `AGENTS.md` with no workspace-boundaries heading or boilerplate.
- Existing `AGENTS.md` files are preserved when Rewrite AGENTS.md is unchecked.
- The Rewrite AGENTS.md checkbox is visible, accessible, unchecked by default, and shows a checked state after interaction.
- Saving from the new instructions-area button sends the edited instructions and the checkbox value.
- When the checkbox is checked, the backend regenerates `AGENTS.md` from the current specialist name, role, and instructions; when unchecked, manual file edits remain untouched.
- The existing bottom save button continues to work through the same submission path.
- Lint, typecheck, unit/integration tests, and Playwright E2E tests pass.

## PR scope

Use one branch and one PR referencing both TickTick task URLs. Do not commit or push until the user explicitly requests it.
