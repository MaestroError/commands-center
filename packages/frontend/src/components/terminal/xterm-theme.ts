import type { ITheme } from "@xterm/xterm";

import type { ResolvedColorMode } from "@/lib/appearance";
import { readThemeCssValue } from "@/lib/theme-css-values";

const ANSI_PALETTES = {
  light: {
    black: "#0f172a",
    red: "#9f1239",
    green: "#14532d",
    yellow: "#78350f",
    blue: "#172554",
    magenta: "#701a75",
    cyan: "#164e63",
    white: "#52627a",
    brightBlack: "#59697f",
    brightRed: "#be123c",
    brightGreen: "#166534",
    brightYellow: "#92400e",
    brightBlue: "#1e40af",
    brightMagenta: "#86198f",
    brightCyan: "#155e75",
    brightWhite: "#334155",
  },
  dark: {
    black: "#6b7b91",
    red: "#f44747",
    green: "#608b4e",
    yellow: "#dcdcaa",
    blue: "#569cd6",
    magenta: "#c586c0",
    cyan: "#4ec9b0",
    white: "#d4d4d4",
    brightBlack: "#94a3b8",
    brightRed: "#ff6b6b",
    brightGreen: "#8cc265",
    brightYellow: "#f5f5a5",
    brightBlue: "#7db7ff",
    brightMagenta: "#d7a6d1",
    brightCyan: "#7fe7d5",
    brightWhite: "#ffffff",
  },
} as const satisfies Record<ResolvedColorMode, ITheme>;

export function buildXtermTheme(mode: ResolvedColorMode): ITheme {
  return {
    background: readThemeCssValue("--terminal-bg"),
    foreground: readThemeCssValue("--terminal-fg"),
    cursor: readThemeCssValue("--terminal-fg"),
    cursorAccent: readThemeCssValue("--terminal-bg"),
    selectionBackground: readThemeCssValue("--selection"),
    ...ANSI_PALETTES[mode],
  };
}
