# Workspace, Documents, and Files Migration Record (DS-0409)

- Task: [DS-0409](../09-workspace-documents-files.md)

## Decisions and deltas

- Raw palette occurrences: **18 → 0** across Workspace/File Manager chrome.
- Dirty-file and file-operation attention states use warning semantic roles.
- Equivalent layout/file glyphs in `WorkspaceLayout.tsx` and `WorkspaceFilesTab.tsx` use Lucide; inline-SVG files in the owned scope are **2 → 0**.
- `WorkspaceLayout` is explicitly owned by DS-0409, resolving the earlier shell/workspace overlap.
- TerminalTabBar and EditorTabBar controllers remain domain-specific. Only their shared appearance state changed.
- Filesystem paths/operations, selection, split panes, document serialization, editor/terminal lifecycle, and portable workspace state were not changed.

Phase 5 retains Milkdown/Crepe, Monaco, xterm, and third-party file-manager theme bridges. Verification is owned by workspace/file/document tests, terminal E2E, and the Phase 4 protected-content gate.
