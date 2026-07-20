# Design-System Exceptions

An exception is for a value or format that cannot correctly use a CC semantic
role. Reducing an audit count, convenience, or vague third-party ownership is
not sufficient evidence.

## Request format

Use a stable `EX-NNN` ID and record:

- the exact repository path and owner;
- the value/format category and why semantic roles are incorrect;
- light/dark behavior and accessibility expectations;
- focused tests or gallery coverage;
- the audit rule and bounded count/path allowance; and
- a retirement condition and review trigger.

The implementation, exception register, audit configuration, and verification
must land together. Allowlists use exact paths and stable IDs, never line
numbers or blanket directories.

## Current register

| ID     | Exact owner                                                                                       | Category                                                         | Verification                                           |
| ------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| EX-001 | `packages/frontend/src/components/common/AppLogo.tsx`                                             | CommandsCenter product artwork                                   | application light/dark logo visibility                 |
| EX-002 | `packages/frontend/src/pages/integrations/integration-icons.tsx`                                  | approved inline-SVG provider/integration artwork format          | provider/integration flows and inline-SVG path ratchet |
| EX-003 | `packages/frontend/src/components/documents/MilkdownDocumentEditor.tsx`                           | Crepe-required serialized `currentColor` SVG                     | image insertion/serialization and Milkdown tests       |
| EX-004 | `packages/frontend/src/components/terminal/xterm-theme.ts`                                        | exactly 32 light/dark ANSI values                                | ANSI E2E and bounded-count audit                       |
| EX-005 | `packages/frontend/src/components/workspace/monaco-theme.ts` plus scoped Milkdown syntax behavior | exactly 10 Monaco syntax values and third-party syntax semantics | Monaco/Milkdown tests and bounded-count audit          |

Semantic editor chrome, borders, focus, selection, diagnostics, terminal base
colors, and Crepe surfaces are not exceptions; they consume CC roles.

## Review and retirement

Review an exception when its owner path, third-party API, count, theme behavior,
or accessibility contract changes. Retire it only after all consumers and
allowlist entries are gone and focused tests prove the semantic replacement.
Never reuse a retired ID for a different purpose.
