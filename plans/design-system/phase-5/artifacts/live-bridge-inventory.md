# Live Bridge Inventory (DS-0501)

- Entry commit: `c32d0159`
- Source scope: `packages/frontend`

| Surface        | Installed consumer                                                     | Current bridge                                                                                        | Mode behavior                                                                            | Owner               |
| -------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------- |
| Milkdown/Crepe | `@milkdown/crepe` 7.21.2 in `MilkdownDocumentEditor.tsx`               | `frame-dark.css` plus scoped `.milkdown-editor-wrapper .milkdown` semantic overrides in `globals.css` | Most overridden roles update through CSS variables; unoverridden frame roles remain dark | DS-0502             |
| Monaco         | `@monaco-editor/react` 4.7.0 / Monaco 0.55.1 in `MonacoFileEditor.tsx` | `theme="vs-dark"`                                                                                     | Fixed dark                                                                               | DS-0503             |
| xterm          | `@xterm/xterm` 5.5.0 in `TerminalInstance.tsx`                         | Constructor-local `theme` with 21 fixed values                                                        | Fixed dark                                                                               | DS-0504             |
| File manager   | CC-owned React components only                                         | No third-party theme API, selector, variable, or runtime consumer                                     | Already follows CC tokens from Phase 4                                                   | DS-0505 no-op audit |

No SVAR or assistant-ui dependency/import/bridge exists. Generic base-element
rules explicitly exclude `.milkdown-editor-wrapper`, `.monaco-editor`, and
`.xterm` descendants.

## Value classification

- Milkdown Crepe color, focus, selection, surface, and shadow variables are
  CC-semantic. CodeMirror syntax values, when retained, are EX-005.
- Monaco editor chrome is CC-semantic. Token rules are bounded EX-005 syntax.
- xterm background, foreground, cursor, cursor accent, and selection are
  CC-semantic. The sixteen normal/bright ANSI roles are bounded EX-004.
- EX-003 remains the `currentColor` SVG string required by Crepe's menu API.

## Reproduction searches

```bash
rg -n 'milkdown|crepe|monaco|xterm|svar|assistant-ui' packages/frontend/package.json pnpm-lock.yaml packages/frontend/src
rg -n --glob '*.{ts,tsx,css}' 'vs-dark|theme:|options\.theme|--crepe|\.monaco-editor|\.xterm' packages/frontend/src
```
