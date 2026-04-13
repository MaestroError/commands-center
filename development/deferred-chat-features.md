# Deferred Chat Features

OpenCode web app features not included in Phase 1 MVP. Consider adding later.

## Composer

- **Contenteditable composer** — rich `contenteditable` div enabling inline non-editable pills for file/agent mentions. MVP uses textarea + popover instead. Upgrade path for polished pill UX. Consider adding later.
- **Custom slash commands** — user-defined commands from `.opencode/command/*.md` files. MVP includes only skills + built-in actions. Consider adding later.

## Session Management

- **Session forking** — create a branch of an existing conversation to explore alternative paths. Consider adding later.
- **Session sharing** — generate a shareable URL for a conversation. Consider adding later.
- **Followup queue** — queue additional messages while the agent is busy, with Send now / Edit controls. Consider adding later.
- **Revert dock** — collapsible list of file changes the agent made, with per-item Restore buttons. Consider adding later.

## Rendering

- **Paced markdown streaming** — animated token reveal with 24ms pace and whitespace-snapping for smooth text appearance. MVP uses plain streaming append. Consider adding later.
- **Full diff viewer in tool cards** — inline before/after diff rendering for edit/write/apply_patch tool results. MVP shows `+N/-N` stats badge only. Requires external diff library (~1100 lines of viewer infrastructure). Consider adding later.
- **Subagent navigation** — task tool cards link to child session for inspecting subagent work. Consider adding later.

## Performance

- **Deferred turn mounting** — mount turns in batches of 3 per animation frame to avoid layout thrashing. Consider adding later.
- **CSS containment** — `content-visibility: auto` on off-screen turns for scroll performance. Consider adding later.
- **Session cache with LRU eviction** — limit how many sessions' messages are kept in memory. Consider adding later.
- **SSE event coalescing** — deduplicate rapid `message.part.updated` events within each ~16ms frame. Consider adding later.
