# PR 184 Continuation Focus, Error, and Layout Maintenance

1. Add regressions for individual Mark read and Mark unread focus recovery, bell archive rollback/error feedback, and maximum-length mobile-title footer visibility and operation.
2. Move focus from a removed focused card to the next or previous card, falling back to the active surface control; render shared read-state failures in the bell; and bound the mobile header so the footer retains visible space.
3. Run focused frontend tests, ESLint fixes, design-system audit, typecheck, formatting, Knip, and whitespace checks before pushing one focused maintenance commit.
