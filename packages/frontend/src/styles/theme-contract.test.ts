import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(resolve(process.cwd(), "src/styles/globals.css"), "utf8");
const lightTheme = readThemeBlock('[data-theme="default"][data-color-mode="light"]');
const darkTheme = readThemeBlock('[data-theme="default"][data-color-mode="dark"]');

const REQUIRED_COLOR_TOKENS = [
  "app-bg",
  "surface",
  "surface-elevated",
  "surface-disabled",
  "sidebar-bg",
  "border",
  "border-strong",
  "divider",
  "text-primary",
  "text-secondary",
  "text-muted",
  "text-disabled",
  "text-inverse",
  "link",
  "accent",
  "accent-hover",
  "accent-active",
  "accent-surface",
  "accent-border",
  "on-accent",
  "selection",
  "focus-ring",
  "success",
  "success-surface",
  "success-border",
  "success-foreground",
  "on-success",
  "warning",
  "warning-surface",
  "warning-border",
  "warning-foreground",
  "on-warning",
  "danger",
  "danger-surface",
  "danger-surface-subtle",
  "danger-border",
  "danger-foreground",
  "on-danger",
  "info",
  "info-surface",
  "info-border",
  "info-foreground",
  "on-info",
  "note-surface",
  "note-border",
  "note-foreground",
  "badge-neutral-surface",
  "badge-neutral-border",
  "badge-neutral-foreground",
  "chat-user",
  "chat-user-foreground",
  "chat-user-border",
  "chat-agent",
  "chat-agent-foreground",
  "chat-agent-border",
  "terminal-bg",
  "terminal-fg",
] as const;

const REQUIRED_SHARED_TOKENS = [
  "shadow-surface",
  "radius-surface",
  "radius-control",
  "radius-field",
  "radius-badge",
  "radius-pill",
  "radius-code",
  "font-weight-heading",
  "font-weight-control",
  "font-weight-badge",
  "font-weight-note",
] as const;

describe("Default theme token contract", () => {
  it("defines every required color token in both resolved modes", () => {
    for (const token of REQUIRED_COLOR_TOKENS) {
      expect(lightTheme).toContain(`--${token}:`);
      expect(darkTheme).toContain(`--${token}:`);
    }
  });

  it("defines every required shared token in both resolved modes", () => {
    for (const token of REQUIRED_SHARED_TOKENS) {
      expect(lightTheme).toContain(`--${token}:`);
      expect(darkTheme).toContain(`--${token}:`);
    }
  });

  it("does not retain a Modern theme selector", () => {
    expect(globalsCss).not.toContain('[data-theme="modern"]');
  });

  it("keeps the complete Crepe bridge scoped to semantic CC values", () => {
    const bridge = readRuleBlock(".milkdown-editor-wrapper .milkdown");
    const requiredCrepeRoles = [
      "background",
      "surface",
      "surface-low",
      "on-background",
      "on-surface",
      "on-surface-variant",
      "primary",
      "secondary",
      "on-secondary",
      "inverse",
      "on-inverse",
      "outline",
      "hover",
      "selected",
      "inline-code",
      "inline-area",
      "error",
    ];

    for (const role of requiredCrepeRoles) {
      expect(bridge).toContain(`--crepe-color-${role}: var(--`);
    }
    expect(bridge).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
  });
});

function readThemeBlock(selector: string): string {
  const start = globalsCss.indexOf(selector);
  const end = globalsCss.indexOf("\n}", start);

  return globalsCss.slice(start, end);
}

function readRuleBlock(selector: string): string {
  const start = globalsCss.indexOf(`${selector} {`);
  const end = globalsCss.indexOf("\n}", start);
  return globalsCss.slice(start, end);
}
