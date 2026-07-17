# DS-0105 — Style Semantic Lists

- Status: Complete
- Phase: [Phase 1](README.md)
- Foundation reference:
  [Phase 1 semantic HTML scope](../../design-system-foundation.md#phase-1--normalize-foundations-without-redesigning-screens)
- Evidence:
  [Semantic HTML impact inventory](../phase-0/artifacts/semantic-html-impact-inventory.md)

## Goal

Make bare ordered, unordered, and description lists read as CC content without
turning navigation, menus, or component-owned lists into prose lists.

## Context

List reset behavior and component markup make global markers risky. Current JSX
has a small number of direct list tags, while Markdown and menu-like structures
have their own ownership. The rollout must distinguish content lists from
navigation and interactive patterns through cascade and explicit component
styles, not broad exceptions based on page names.

## Scope

- Define defaults for `ul`, `ol`, `li`, `dl`, `dt`, and `dd` in generic content.
- Cover nested levels, marker style/color, indentation, spacing, and long-item
  wrapping.
- Verify menu, navigation, tab, tree, and listbox patterns retain their existing
  component-owned presentation.
- Keep Markdown and Milkdown list ownership unchanged.

## Required deliverables

- Generic ordered, unordered, nested, and description-list base rules.
- Fixtures/tests distinguishing content lists from component-owned list roles.
- Reviewed narrow/wide and light/dark list screenshots with overflow evidence.

## Blockers and dependencies

- Blocked by: DS-0104.
- Blocks: DS-0106 and DS-0108.

## Acceptance criteria

- [ ] Bare ordered, unordered, nested, and description lists are legible in both
      modes and at narrow widths.
- [ ] Long unbroken list content cannot expand the page viewport.
- [ ] Navigation, menus, tabs, trees, listboxes, and reset-owned component lists
      do not acquire prose markers or spacing.
- [ ] Explicit utilities can remove or change markers and indentation.
- [ ] Markdown and Milkdown list screenshots remain unchanged.
- [ ] Zero-match list types remain represented in the semantic fixture.

## Verification tests

- Capture bare and nested list fixtures in both modes and viewport sizes.
- Add assertions for marker presence in generic lists and marker absence in
  representative component-owned list roles.
- Assert narrow list containers satisfy `scrollWidth <= clientWidth`.
- Run affected component tests plus semantic, Markdown, and Milkdown visual
  suites twice.

## Out of scope

- Refactoring menus/navigation to Shadcn or Radix.
- Changing Markdown list rendering.
- Domain-specific tree and file-manager styling.
