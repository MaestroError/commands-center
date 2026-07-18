# Final Bridge Inventory (DS-0507)

| Surface      | Entry                                                           | Final                                                      | Disposition                                                  |
| ------------ | --------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| Milkdown     | fixed `frame-dark.css` plus partial semantic overrides          | no fixed frame; 22 scoped Crepe variables                  | semantic CSS bridge, EX-003 SVG and EX-005 syntax retained   |
| Monaco       | fixed `theme="vs-dark"`                                         | `cc-default-light` / `cc-default-dark` through Monaco APIs | semantic chrome plus 10 bounded EX-005 token colors          |
| xterm        | 5 fixed base roles + 16 dark ANSI values in lifecycle component | 5 computed semantic base roles + 32 light/dark ANSI values | EX-004 owns ANSI; appearance effect is lifecycle-independent |
| File manager | no third-party consumer                                         | no third-party consumer                                    | verified no-op                                               |

Residual fixed theme imports/assignments (`frame-dark.css`,
`theme="vs-dark"`, component-local xterm theme object): **0**. Direct bridge
preference/storage/media-query reads: **0**. SVAR/assistant-ui dependencies,
imports, and adapters: **0**.

Approved paths are `styles/globals.css` for the scoped Crepe mapping,
`components/workspace/monaco-theme.ts`,
`components/terminal/xterm-theme.ts`, and `lib/theme-css-values.ts`.
