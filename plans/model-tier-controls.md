# Model tier controls

Feature branch: `codex/model-tier-controls`, based on `codex/opencode-v2-migration`.

## Behavior

Use OpenCode model variants (reasoning effort, e.g. medium/high), not billing or
priority service tiers. Expose only the selected model's available variants.
Keep an explicit default option that delegates to OpenCode; label the concrete
default only when the SDK exposes enough information to determine it reliably.
Changing models resets an explicit tier so incompatible variants cannot leak.
Persist task/template tier settings, including portable template files, and carry
resolved tiers into runs. Chat selection follows the existing per-conversation
model preference lifecycle. Fallback models each retain their own model/tier selection.

## Tasks

- [x] Inspect SDK catalog/default semantics and model selection/execution paths.
- [x] Extend provider metadata and shared schemas with variant choices/default information.
- [x] Preserve variants using OpenCode native provider/model#variant references in existing model fields; verify task/template/run and portable template round trips. No database migration needed.
- [x] Pass variants through chat and task execution into the SDK model reference.
- [x] Add reusable tier dropdown beside model selection in chat/task/template forms.
- [x] Cover selection/default/reset, template round trips and actual SDK request behavior with tests.
- [x] Run ESLint --fix, formatting, typechecks, relevant tests, design-system audit and browser acceptance.

## Verification

- Full package suite: 3,499 passing tests (backend 1,628; frontend 1,592; shared 234; CLI 45).
- Real embedded SDK tests verify the provider receives the chosen effort and returning to default clears the override.
- Template-file recovery preserves the model/tier reference after deleting the runtime database row.
- Typechecks and design-system audit pass; all 56 Chromium design-system checks pass.
- Final embedded browser acceptance: 27/27 passed against the rebuilt owned Select UI, including chat tier persistence, scheduled execution and task/template editor saves.
- The expanded suite exceeded the owner-login rate limit; chat fixtures now authenticate once and reuse cookies, matching the existing task-suite approach. Production authentication is unchanged.
- ESLint --fix, formatting, build and diff checks passed.
- Feature published in PR #210 targeting `codex/opencode-v2-migration`.

## PR review follow-up

- [x] Use full model references as distinct dropdown values for the base model and every provider variant, including `default`.
- [x] Test selecting and restoring the explicit `default` tier and returning to model default.
- [x] Run ESLint --fix, regression tests and typechecking before updating PR #210. All 19 ModelSelector tests, frontend typecheck and design-system audit passed.
