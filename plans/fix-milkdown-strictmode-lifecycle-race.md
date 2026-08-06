# Fix Milkdown StrictMode lifecycle race

## Assumptions

- The two read-only ProseMirror nodes reported by CI are a real duplicate editor mount, not an acceptable test condition.
- React StrictMode's development cleanup/remount cycle can overlap Milkdown's asynchronous `create()` lifecycle.
- The existing strict Playwright locator should continue detecting duplicate editor instances.

## Plan

- [x] Track each Milkdown creation promise and defer destruction until that creation settles.
- [x] Prevent a disposed editor instance from becoming the active ref or applying read-only state.
- [x] Strengthen the read-only E2E regression to assert exactly one matching ProseMirror node.
- [x] Run ESLint, frontend typechecking and tests, both E2E shards, and a repeated CI-mode run of the failing test.
- [x] Review the final diff, commit the scoped fix, and push the existing PR branch.

## Success criteria

- StrictMode cleanup cannot leave a stale Milkdown editor in the DOM.
- The read-only baseline contains exactly one non-editable ProseMirror node.
- The previously failing test remains stable under CI-mode repetition.
- Required linting, tests, and E2E flows pass before publishing.
