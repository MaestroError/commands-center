# Monaco Mapping (DS-0503)

`components/workspace/monaco-theme.ts` is the sole Monaco appearance adapter.
It reads computed CC variables and registers `cc-default-light` or
`cc-default-dark` through `monaco.editor.defineTheme`; mounted editors receive
updates through `monaco.editor.setTheme`.

| Monaco role              | CC source                                  |
| ------------------------ | ------------------------------------------ |
| editor/gutter background | `--surface`                                |
| foreground               | `--text-primary`                           |
| line highlight/widgets   | `--surface-elevated`                       |
| line numbers             | `--text-muted`, `--text-secondary`         |
| cursor/focus             | `--accent`, `--focus-ring`                 |
| selection                | `--selection`                              |
| guides/borders/inputs    | `--border`, `--border-strong`, `--surface` |
| diagnostics              | `--danger`, `--warning`                    |

The ten light/dark token colors in `SYNTAX_RULES` are bounded EX-005 syntax
roles. Theme changes do not enter the editor/model initialization dependencies,
so value, focus, view state, and the lazy-loaded Monaco instance remain intact.
