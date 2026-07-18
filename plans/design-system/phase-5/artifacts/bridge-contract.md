# Third-party Bridge Contract (DS-0501)

| Surface      | Semantic inputs                                                                                                      | Bounded roles                   | Live update                                               | Lifecycle boundary                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| Milkdown     | surface, elevated surface, app background, primary/secondary text, accent, border, selection, danger, radius, shadow | CodeMirror syntax under EX-005  | CSS variables resolve from the root appearance attributes | Never recreate Crepe for appearance                                         |
| Monaco       | surface/background, text, muted text, border, accent/focus, selection, error/warning                                 | Monaco token rules under EX-005 | redefine/select the CC theme through `monaco.editor`      | Preserve model, view state, focus, value, and lazy loading                  |
| xterm        | terminal background/foreground, selection, cursor                                                                    | 16 ANSI roles under EX-004      | assign `terminal.options.theme`                           | Preserve terminal, addons, socket, buffer, listeners, selection, and scroll |
| File manager | Existing CC semantic Tailwind roles                                                                                  | None                            | React/CSS appearance contract                             | No adapter without a third-party consumer                                   |

Adapters may consume `resolvedColorMode` from `ThemeContext` and computed CC
CSS variables. They must not read or persist `cc.color-mode`, call
`matchMedia`, write appearance attributes, or create a second preference
store. Milkdown stays scoped in CSS; Monaco and xterm use supported public APIs,
not descendant selector trees.

Monaco and xterm initialization effects remain independent of appearance
effects. A mode change may update theme data only; it may not recreate an
editor, model, terminal, addon, WebSocket, resize observer, or domain state.
