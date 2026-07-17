# Skill content copy button plan

## Scope

Add a Copy action to the selected skill's full-content section on the Skills page.

## Assumptions

- “Full content” is the complete `detailsMarkdown` string displayed in the Details tab.
- The existing `CopyableCode` component is the requested reusable code-section copy control.
- Skills without `detailsMarkdown` continue to omit the content section.

## Implementation tasks

- [x] Add focused Skills page coverage proving the full content is written to the clipboard.
- [x] Reuse `CopyableCode` for the skill content section instead of adding another clipboard implementation.
- [x] Run ESLint with fixes, focused tests, typecheck, the full suite, and relevant Skills E2E coverage.

## Acceptance criteria

- The Details tab shows a Copy button beside the skill content section.
- Clicking Copy writes the exact, complete `detailsMarkdown` value.
- The button uses the existing code-section copy styling and Copied confirmation.
- No API, persistence, or portable workspace changes are introduced.

## Constraints

- Preserve unrelated uncommitted UI fixes.
- Do not add dependencies.
- Do not commit.
