# Guidance Consistency Review

| Statement                                  | Entry point             | Canonical source / enforcement                        |
| ------------------------------------------ | ----------------------- | ----------------------------------------------------- |
| Tailwind is the ordinary styling default   | AGENTS, CONTRIBUTING    | `docs/design-system/README.md`, DS002                 |
| Theme roles use semantic tokens            | AGENTS                  | `content-and-styling.md`, DS002                       |
| Generic HTML is CC-styled                  | canonical guide         | `globals.css` base layer and gallery semantic surface |
| Markdown/Milkdown are protected separately | AGENTS, canonical guide | `content-and-styling.md`, focused E2E                 |
| Domain code imports CC-owned primitives    | AGENTS                  | `components.md`, ESLint Radix boundary                |
| Inline SVG needs an exception              | AGENTS                  | `exceptions.md`, DS001                                |
| No new compatibility consumers             | AGENTS                  | `content-and-styling.md`, DS004                       |
| Bridge modules do not resolve appearance   | AGENTS                  | `content-and-styling.md`, DS005/DS006                 |
| Theme additions obey portability           | AGENTS                  | `themes.md`, Portable Workspace Rule                  |
| Audit command                              | AGENTS, CONTRIBUTING    | root `package.json`, CI static checks                 |

The frontend stack table now matches the manifest and live imports: the chat
and file manager are CC-owned React surfaces; absent assistant-ui and SVAR
claims were removed. README links to the canonical guide without duplicating it.
