# Task template detail backdrop plan

## Scope

Add the same dark, dismissible page backdrop to the task-template detail drawer that the task detail drawer already uses.

## Assumptions

- “Dark background” refers to the dimmed page backdrop visible behind the task detail drawer, not a new hard-coded drawer color.
- The existing theme-backed drawer surfaces remain unchanged.
- Clicking the backdrop should close the template drawer, matching task detail behavior.

## Implementation tasks

- [x] Add focused frontend regression coverage for the template backdrop color and click-to-close behavior.
- [x] Render the template detail backdrop with the same `bg-black/40` styling and layer ordering as the task detail backdrop.
- [x] Run ESLint with fixes and the focused frontend test, then run the required full test suite.

## Verification

- The template detail panel renders above a `bg-black/40` backdrop.
- Clicking the backdrop removes the selected template from the URL and closes the panel.
- ESLint and tests pass.

## Constraints

- Use existing theme/style conventions.
- Do not add dependencies or persistence changes.
- Do not commit.
