import assert from "node:assert/strict";
import { test } from "node:test";

import { auditSources, formatViolation } from "./design-system-audit.mjs";

const GLOBALS_PATH = "packages/frontend/src/styles/globals.css";
const MONACO_PATH = "packages/frontend/src/components/workspace/monaco-theme.ts";
const XTERM_PATH = "packages/frontend/src/components/terminal/xterm-theme.ts";

function validSources() {
  return new Map([
    [
      GLOBALS_PATH,
      `.milkdown-editor-wrapper .milkdown {\n${"--crepe-color: var(--surface);\n".repeat(22)}}`,
    ],
    [MONACO_PATH, `export const syntax = [${'{ foreground: "000000" },'.repeat(10)}];`],
    [XTERM_PATH, `export const ansi = [${'"#000000",'.repeat(32)}];`],
  ]);
}

function rulesFor(sources) {
  return auditSources(sources).violations.map((violation) => violation.rule);
}

test("accepts the isolated approved baseline", () => {
  assert.deepEqual(auditSources(validSources()).violations, []);
});

test("accepts semantic base exclusions contained by zero-specificity wrappers", () => {
  const sources = validSources();
  sources.set(
    GLOBALS_PATH,
    `${sources.get(GLOBALS_PATH)}\n@layer cc-semantic {
      :where(p:not([class]):not(.cc-md *)) { color: inherit; }
      :where(p:not([class])) + :where(p:not([class])) { margin-top: 1rem; }
      :where(li:not([class]))::marker { color: var(--accent); }
      :where(a, button):focus-visible { outline: solid; }
    }`,
  );
  assert.deepEqual(auditSources(sources).violations, []);
});

test("rejects semantic base exclusions outside zero-specificity wrappers", () => {
  const sources = validSources();
  sources.set(
    GLOBALS_PATH,
    `${sources.get(GLOBALS_PATH)}\n@layer cc-semantic {
      :where(p):not([class]) { color: inherit; }
    }`,
  );
  assert.deepEqual(rulesFor(sources), ["DS009"]);
});

test("rejects a bare semantic base selector", () => {
  const sources = validSources();
  sources.set(
    GLOBALS_PATH,
    `${sources.get(GLOBALS_PATH)}\n@layer cc-semantic {
      p { color: inherit; }
    }`,
  );
  assert.deepEqual(rulesFor(sources), ["DS009"]);
});

test("rejects an unapproved inline SVG", () => {
  const sources = validSources();
  sources.set("packages/frontend/src/components/NewIcon.tsx", "export const icon = <svg />;");
  assert.deepEqual(rulesFor(sources), ["DS001"]);
});

test("rejects a raw Tailwind palette role", () => {
  const sources = validSources();
  sources.set(
    "packages/frontend/src/components/RawRole.tsx",
    'export const value = <div className="bg-red-500" />;',
  );
  assert.deepEqual(rulesFor(sources), ["DS002"]);
});

test("rejects a raw foreground on an accent control", () => {
  const sources = validSources();
  sources.set(
    "packages/frontend/src/components/RawAccentForeground.tsx",
    'export const value = <button className="bg-accent text-white" />;',
  );
  assert.deepEqual(rulesFor(sources), ["DS002"]);
});

test("rejects the undefined accent-contrast utility", () => {
  const sources = validSources();
  sources.set(
    "packages/frontend/src/components/UndefinedAccentForeground.tsx",
    'export const value = <button className="bg-accent text-accent-contrast" />;',
  );
  assert.deepEqual(rulesFor(sources), ["DS002"]);
});

test("rejects a new custom dialog signature", () => {
  const sources = validSources();
  sources.set(
    "packages/frontend/src/components/NewModal.tsx",
    'export const modal = <section role="dialog" />;',
  );
  assert.deepEqual(rulesFor(sources), ["DS003"]);
});

test("rejects a retired compatibility class", () => {
  const sources = validSources();
  sources.set(
    "packages/frontend/src/components/OldButton.tsx",
    'export const button = <button className="cc-button-primary" />;',
  );
  assert.deepEqual(rulesFor(sources), ["DS004"]);
});

test("rejects growth in a retained compatibility class", () => {
  const sources = validSources();
  sources.set(
    "packages/frontend/src/components/ExtraPanels.tsx",
    `export const panels = "${"cc-panel ".repeat(86)}";`,
  );
  assert.deepEqual(rulesFor(sources), ["DS004"]);
});

test("rejects a direct domain button compatibility consumer below the global ratchet", () => {
  const sources = validSources();
  sources.set(
    "packages/frontend/src/components/NewAction.tsx",
    'export const action = <button className="cc-button" />;',
  );
  assert.deepEqual(rulesFor(sources), ["DS004"]);
});

test("accepts compatibility ownership inside the typed primitive layer", () => {
  const sources = validSources();
  sources.set(
    "packages/frontend/src/components/ui/button-variants.ts",
    'export const classes = "cc-button cc-button-secondary";',
  );
  assert.deepEqual(auditSources(sources).violations, []);
});

test("accepts an exact retained specialized textarea consumer", () => {
  const sources = validSources();
  sources.set(
    "packages/frontend/src/components/chat/ChatComposer.tsx",
    'export const field = <textarea aria-label="Message" />;',
  );
  assert.deepEqual(auditSources(sources).violations, []);
});

test("rejects a direct native textarea consumer", () => {
  const sources = validSources();
  sources.set(
    "packages/frontend/src/components/NewField.tsx",
    'export const field = <textarea aria-label="Notes" />;',
  );
  assert.deepEqual(rulesFor(sources), ["DS004"]);
});

test("rejects native textarea growth in a retained specialized path", () => {
  const sources = validSources();
  sources.set(
    "packages/frontend/src/components/chat/ChatComposer.tsx",
    'export const fields = <><textarea aria-label="Message" /><textarea aria-label="Extra" /></>;',
  );
  assert.deepEqual(rulesFor(sources), ["DS004"]);
});

test("rejects a retired badge compatibility class", () => {
  const sources = validSources();
  sources.set(
    "packages/frontend/src/components/LegacyBadge.tsx",
    'export const badge = <span className="cc-badge" />;',
  );
  assert.deepEqual(rulesFor(sources), ["DS004"]);
});

test("rejects a direct native select consumer", () => {
  const sources = validSources();
  sources.set(
    "packages/frontend/src/components/DomainFilter.tsx",
    'export const filter = <select aria-label="Filter" />;',
  );
  assert.deepEqual(rulesFor(sources), ["DS004"]);
});

test("rejects a fixed Monaco theme bypass", () => {
  const sources = validSources();
  sources.set(
    "packages/frontend/src/components/workspace/Bypass.tsx",
    'export const editor = <Editor theme="vs-dark" />;',
  );
  assert.deepEqual(rulesFor(sources), ["DS005"]);
});

test("rejects media-query reads inside a bridge adapter", () => {
  const sources = validSources();
  sources.set(XTERM_PATH, `${sources.get(XTERM_PATH)}\nmatchMedia("dark");`);
  assert.deepEqual(rulesFor(sources), ["DS005"]);
});

test("rejects a thirty-third ANSI value", () => {
  const sources = validSources();
  sources.set(XTERM_PATH, `${sources.get(XTERM_PATH)}\n"#ffffff";`);
  assert.deepEqual(rulesFor(sources), ["DS006"]);
});

test("rejects an eleventh Monaco syntax value", () => {
  const sources = validSources();
  sources.set(MONACO_PATH, `${sources.get(MONACO_PATH)}\n{ foreground: "ffffff" };`);
  assert.deepEqual(rulesFor(sources), ["DS006"]);
});

test("rejects an unscoped Crepe variable", () => {
  const sources = validSources();
  sources.set(GLOBALS_PATH, `${sources.get(GLOBALS_PATH)}\n:root { --crepe-extra: red; }`);
  assert.deepEqual(rulesFor(sources), ["DS006"]);
});

test("rejects a broken canonical-documentation link", () => {
  const sources = validSources();
  sources.set("docs/design-system/README.md", "[Missing](missing.md)");
  assert.deepEqual(rulesFor(sources), ["DS007"]);
});

test("rejects a missing canonical-documentation example import", () => {
  const sources = validSources();
  sources.set("docs/design-system/README.md", 'import { Missing } from "@/components/Missing";');
  assert.deepEqual(rulesFor(sources), ["DS008"]);
});

test("normalizes Windows-style fixture paths", () => {
  const sources = new Map(
    [...validSources()].map(([file, source]) => [file.replaceAll("/", "\\"), source]),
  );
  assert.deepEqual(auditSources(sources).violations, []);
});

test("formats violations with remediation and documentation", () => {
  const message = formatViolation({
    alternative: "Use a semantic token.",
    file: "example.tsx",
    match: "#fff",
    rule: "DS002",
  });
  assert.match(message, /\[DS002\] example\.tsx: #fff/);
  assert.match(message, /Approved alternative: Use a semantic token\./);
  assert.match(message, /Documentation: docs\/design-system\/README\.md/);
});
