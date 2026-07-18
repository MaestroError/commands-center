# xterm Mapping (DS-0504)

`components/terminal/xterm-theme.ts` is the sole xterm appearance adapter.

| xterm role                 | CC source                             |
| -------------------------- | ------------------------------------- |
| background / cursor accent | `--terminal-bg`                       |
| foreground / cursor        | `--terminal-fg`                       |
| selection                  | `--selection`                         |
| normal/bright ANSI roles   | mode-specific `ANSI_PALETTES`, EX-004 |

Both bounded ANSI palettes preserve terminal meanings while meeting a 4.5:1
minimum contrast ratio against their Default mode background. The former dark
black/bright-black values and the initial light bright colors were adjusted
after deterministic browser inspection exposed insufficient contrast. These
colors are terminal protocol roles, not general application tokens.

The lifecycle effect reads the current mode through a ref only during initial
construction. A separate appearance effect assigns `terminal.options.theme`.
Unit and real-browser tests prove one terminal and one WebSocket remain across
explicit and system-resolved mode changes. Computed-style assertions verify
every ANSI role in light and dark at desktop and mobile widths.
