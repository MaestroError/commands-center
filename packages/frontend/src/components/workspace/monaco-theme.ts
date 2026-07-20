import type { ResolvedColorMode } from "@/lib/appearance";
import { readThemeCssValue, toHexColor } from "@/lib/theme-css-values";

export type MonacoThemeApi = {
  editor: {
    defineTheme: (name: string, theme: MonacoThemeData) => void;
    setTheme: (name: string) => void;
  };
};

type MonacoThemeData = {
  base: "vs" | "vs-dark";
  inherit: boolean;
  rules: Array<{ token: string; foreground: string }>;
  colors: Record<string, string>;
};

const THEME_IDS = {
  dark: "cc-default-dark",
  light: "cc-default-light",
} as const satisfies Record<ResolvedColorMode, string>;

const SYNTAX_RULES = {
  light: [
    { token: "comment", foreground: "64748b" },
    { token: "keyword", foreground: "7c3aed" },
    { token: "string", foreground: "15803d" },
    { token: "number", foreground: "b45309" },
    { token: "type", foreground: "0369a1" },
  ],
  dark: [
    { token: "comment", foreground: "64748b" },
    { token: "keyword", foreground: "c084fc" },
    { token: "string", foreground: "a7f3d0" },
    { token: "number", foreground: "fbbf24" },
    { token: "type", foreground: "67e8f9" },
  ],
} as const satisfies Record<ResolvedColorMode, Array<{ token: string; foreground: string }>>;

export function getMonacoThemeId(mode: ResolvedColorMode): string {
  return THEME_IDS[mode];
}

export function registerMonacoTheme(monaco: MonacoThemeApi, mode: ResolvedColorMode): string {
  const color = (variable: `--${string}`) => toHexColor(readThemeCssValue(variable));
  const theme: MonacoThemeData = {
    base: mode === "dark" ? "vs-dark" : "vs",
    inherit: true,
    rules: [...SYNTAX_RULES[mode]],
    colors: {
      "editor.background": color("--surface"),
      "editor.foreground": color("--text-primary"),
      "editorCursor.foreground": color("--accent"),
      "editor.selectionBackground": color("--selection"),
      "editor.inactiveSelectionBackground": color("--selection"),
      "editor.lineHighlightBackground": color("--surface-elevated"),
      "editorLineNumber.foreground": color("--text-muted"),
      "editorLineNumber.activeForeground": color("--text-secondary"),
      "editorGutter.background": color("--surface"),
      "editorIndentGuide.background1": color("--border"),
      "editorIndentGuide.activeBackground1": color("--border-strong"),
      "editorWidget.background": color("--surface-elevated"),
      "editorWidget.border": color("--border-strong"),
      "input.background": color("--surface"),
      "input.border": color("--border-strong"),
      focusBorder: color("--focus-ring"),
      "editorError.foreground": color("--danger"),
      "editorWarning.foreground": color("--warning"),
    },
  };

  monaco.editor.defineTheme(THEME_IDS[mode], theme);
  return THEME_IDS[mode];
}
