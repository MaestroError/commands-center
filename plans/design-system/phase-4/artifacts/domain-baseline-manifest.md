# Domain Baseline Manifest (DS-0411)

- Task: [DS-0411](../11-domain-baselines.md)
- Strategy: retain bounded shared visual baselines and pair them with real domain interaction suites; do not snapshot every page.

| Domain                 | Representative evidence                                       | Risk covered                                                | View/mode                                                |
| ---------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| Shell/global           | application baseline + Phase 1 shell interaction test         | menu, shortcut, focus return, every header action, overflow | light/dark 1280/390; interactions 1280/390/320           |
| Specialists            | `e2e/specialists.spec.ts` + shared primitive/common baselines | form controls, validation, status, actions                  | real flow; shared light/dark/narrow/wide visual contract |
| Task authoring         | task templates + chat mention E2E                             | composer insertion, attachments, scheduling/forms           | real flow; shared light/dark/narrow/wide contract        |
| Task operations        | board/runs/feedback E2E                                       | drag/drop, status, progress, actions                        | real flow; semantic status gallery in both modes         |
| Integrations/providers | provider connections E2E                                      | dialogs, connection status, brand exception                 | real flow; shared dialogs/statuses both modes            |
| Settings/API/tools     | custom-tools E2E + Checkbox gallery test                      | dense actions, destructive flow, tri-state                  | light/dark primitive snapshots; narrow dialog bounds     |
| Chat/media             | chat + chat-mentions E2E; Markdown baselines                  | streaming, suggestions, media/actions, protected Markdown   | light/dark 1280/390; real interactions                   |
| Workspace/docs/files   | terminal E2E + Milkdown baselines + workspace unit suites     | panes, lifecycle, editor boundary, document protection      | light/dark 1280/390; protected editor states             |

State coverage is split intentionally: primitive/common baselines own focus, disabled, selected, success/warning/danger, dialogs, menus, and narrow bounds; domain E2E owns real data/API/navigation behavior. Snapshot changes are limited to semantic-token/icon/primitive migration and the shell status dot documented by DS-0402.

The `__design-system-baseline` route remains guarded by `import.meta.env.DEV`; the production build search in DS-0412 verifies its markers are absent.
