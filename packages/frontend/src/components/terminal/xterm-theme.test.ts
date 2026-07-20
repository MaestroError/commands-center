import { beforeEach, describe, expect, it } from "vitest";

import type { ITheme } from "@xterm/xterm";

import { buildXtermTheme } from "./xterm-theme";

const ANSI_ROLES = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const satisfies Array<keyof ITheme>;

describe("buildXtermTheme", () => {
  beforeEach(() => {
    document.documentElement.style.setProperty("--selection", "rgba(37, 99, 235, 0.16)");
  });

  it("keeps every light ANSI role readable against the terminal background", () => {
    document.documentElement.style.setProperty("--terminal-bg", "#e2e8f0");
    document.documentElement.style.setProperty("--terminal-fg", "#0f172a");

    expectAnsiContrast(buildXtermTheme("light"));
  });

  it("keeps every dark ANSI role readable against the terminal background", () => {
    document.documentElement.style.setProperty("--terminal-bg", "#020617");
    document.documentElement.style.setProperty("--terminal-fg", "#cbd5e1");

    expectAnsiContrast(buildXtermTheme("dark"));
  });
});

function expectAnsiContrast(theme: ITheme): void {
  const background = theme.background;
  expect(background).toBeDefined();

  for (const role of ANSI_ROLES) {
    const foreground = theme[role];
    expect(foreground, role).toBeDefined();
    expect(contrastRatio(foreground!, background!), role).toBeGreaterThanOrEqual(4.5);
  }
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string): number {
  const channels = color
    .slice(1)
    .match(/../g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
