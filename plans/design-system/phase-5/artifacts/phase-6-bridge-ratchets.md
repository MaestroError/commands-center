# Phase 6 Bridge Ratchets

Recommended checks:

```bash
rg -n 'theme="vs-dark"|frame-dark\.css|theme:\s*\{' packages/frontend/src/components
rg -n 'cc\.color-mode|matchMedia|data-color-mode|data-theme' packages/frontend/src/components/workspace/monaco-theme.ts packages/frontend/src/components/terminal/xterm-theme.ts
rg -n 'svar|assistant-ui' packages/frontend/package.json packages/frontend/src
rg -o 'foreground: "[0-9A-Fa-f]{6}"' packages/frontend/src/components/workspace/monaco-theme.ts | wc -l
rg -o '#[0-9A-Fa-f]{6}' packages/frontend/src/components/terminal/xterm-theme.ts | wc -l
```

Expected results are 0, 0, 0, 10, and 32. The first three are no-increase
invariants. The bounded counts require review when changed; hiding a value in a
vague variable does not satisfy the check. A negative fixture containing
`theme="vs-dark"`, a bridge-local `matchMedia`, or a 33rd xterm hex value makes
the corresponding command fail its documented expectation.

Only `MonacoFileEditor.tsx` and `TerminalInstance.tsx` may consume
`resolvedColorMode` for these adapters. They may not read persistence or OS
media directly. Crepe selectors must begin with `.milkdown-editor-wrapper`.
