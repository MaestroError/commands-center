# Audit Rule Register

Command: `pnpm design-system:audit`

| Rule  | Purpose                                               | Baseline / exception                          | Remediation                      |
| ----- | ----------------------------------------------------- | --------------------------------------------- | -------------------------------- |
| DS000 | Required owner paths exist                            | globals, Monaco, xterm paths                  | migrate with contract evidence   |
| DS001 | No new inline SVG                                     | EX-001/002/003 exact paths                    | use Lucide or register EX-NNN    |
| DS002 | No raw component palette roles                        | globals token source; bounded exception paths | use semantic roles               |
| DS003 | No new custom-dialog implementation paths             | 10 exact audit-first legacy/domain paths      | use CC Dialog/AlertDialog        |
| DS004 | Compatibility cannot grow or return                   | per-class maxima; retired primary/nav names   | use components/semantic Tailwind |
| DS005 | No fixed-theme or appearance-resolution bridge bypass | two resolved-mode consumers                   | use approved adapters            |
| DS006 | Controlled palette/scope counts                       | EX-004=32, EX-005=10, Crepe=22 scoped         | update exception evidence/tests  |
| DS007 | Canonical docs links resolve                          | `docs/design-system/`                         | fix relative link                |
| DS008 | Canonical example imports resolve                     | `@/` frontend modules                         | use a live exported module       |

Each rule has an isolated positive/negative Node test. Failure output includes
the rule ID, path, match, approved alternative, and canonical documentation.
Paths are normalized for macOS/Linux and Windows-style fixtures.

Measured locally: the complete audit plus 15 negative/positive tests completes
in approximately 0.25 seconds, so CI integration is appropriate. It is omitted
from lint-staged because most staged changes are unrelated and the identical
root command already runs in CI and the release gate.
