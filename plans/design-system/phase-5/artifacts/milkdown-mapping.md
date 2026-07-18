# Milkdown/Crepe Mapping (DS-0502)

| Crepe role                 | CC source                               |
| -------------------------- | --------------------------------------- |
| background / on-background | `--surface` / `--text-primary`          |
| surface / surface-low      | `--surface-elevated` / `--app-bg`       |
| on-surface / variant       | `--text-primary` / `--text-secondary`   |
| primary                    | `--accent`                              |
| secondary / on-secondary   | `--surface-elevated` / `--text-primary` |
| inverse / on-inverse       | `--text-inverse` / `--app-bg`           |
| outline                    | `--border`                              |
| hover / selected           | `--surface-elevated` / `--selection`    |
| inline code / code area    | `--text-primary` / `--app-bg`           |
| error                      | `--danger`                              |
| shadows                    | `--shadow-surface`                      |

The fixed `frame-dark.css` import was removed. Common Crepe structure remains,
while every appearance role is scoped beneath `.milkdown-editor-wrapper` and
updates through the root semantic variables. EX-003's SVG string remains
unchanged. CodeMirror syntax stays bounded under EX-005.

Reviewed baseline differences are intentional semantic convergence: Default
light now has a true light editor, Default dark follows CC's navy surfaces,
and read-only/menu/selection fixtures use the same semantic bridge. Document
content, serialization, menu behavior, and `.cc-md` styles did not change.
