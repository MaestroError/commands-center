# DS-0408 — Migrate Chat and Media Chrome

- Status: Planned
- Phase: [Phase 4](README.md)
- Foundation reference:
  [protected Markdown contract](../../design-system-foundation.md#3-protect-the-existing-markdown-styles)
- Adoption rows: UI-004, UI-009 through UI-011, UI-019, and UI-021 in the
  [component adoption matrix](../phase-0/artifacts/component-adoption-matrix.md)

## Goal

Migrate chat shell, composer chrome, conversation/history dialogs, model/tool/
media controls, messages, attachments, and image viewing to approved CC
primitives while preserving streaming, input focus, and frozen Markdown output.

## Context

Chat contains many inline SVG UI glyphs, repeated icon actions, raw category/
status colors, custom dialogs/lightboxes, model selection, attachments, and
tool/permission controls. `.cc-md` and `.cc-md--chat` are frozen. File/slash/
specialist suggestion popovers must retain textarea focus and domain keyboard
ownership and are explicitly excluded from generic Radix Popover migration.

## Scope

- Migrate chat header/composer chrome, message controls, history/system-prompt
  dialogs, media/attachment controls, ImageLightbox, ModelSelector, permission/
  auto-approve/tool controls, and assigned files from DS-0401.
- Compose approved Button/IconButton, Tooltip, Dialog, Tabs, fields, surfaces,
  alerts/statuses, and combobox APIs where behavior matches.
- Audit ModelSelector independently before composing common combobox support;
  keep provider/model domain loading and selection outside primitives.
- Keep suggestion popover focus/arrow/Enter/Escape/insertion logic unchanged;
  migrate only their semantic visual roles or equivalent glyphs.
- Replace equivalent inline UI SVGs with Lucide; keep accurate labels.
- Preserve streaming, message/tool rendering, attachment upload/removal,
  conversation switching, permissions, prompt history, composer focus, and
  retry/error behavior.

## Required deliverables

- Migrated chat/media files with focused tests.
- Updated chat E2E coverage for streaming, prompts, attachments, history,
  dialogs/lightbox, model/tool controls, suggestions, and failure states.
- Light/dark narrow/wide chat chrome baselines with frozen Markdown comparison.
- `artifacts/chat-media-migration-record.md` with file list, palette/icon deltas,
  dialog/combobox decisions, protected selectors, and excluded popover behavior.

## Blockers and dependencies

- Blocked by: DS-0401 and required Phase 3 Dialog/Tabs/SearchableSelect APIs.
- Blocks: DS-0410, DS-0411, and DS-0412.

## Acceptance criteria

- [ ] Streaming, messages/tools, prompt send/history, attachments, permissions,
      conversations, models, media, and error/retry behavior remains unchanged.
- [ ] `.cc-md` and `.cc-md--chat` markup, selectors, computed styles, and
      screenshots have no intentional change.
- [ ] Suggestion popovers retain textarea focus and existing insertion/keyboard
      behavior; no focus-moving generic Popover replaces them.
- [ ] Dialog/lightbox close, focus, overlay, and return behavior matches each
      audited domain contract.
- [ ] Equivalent UI glyphs use Lucide and all icon actions remain labeled.
- [ ] Theme-dependent category/status colors are semantic or explicitly bounded
      by documented product meaning.
- [ ] Domain code imports only CC-owned APIs, never Radix directly.
- [ ] Chat/composer/media layouts remain usable at narrow widths without new
      overflow.

## Verification tests

- Run focused chat composer/message/model/media/dialog/permission tests.
- Run full chat E2E for streaming, send, attachment, history, model/tool,
  suggestions, lightbox/dialogs, and degraded/error states.
- Compare Markdown baselines twice in Default light/dark and narrow/wide.
- Re-run chat-owned palette/inline-SVG inventories and verify accessible names.

## Out of scope

- Changing Markdown rendering or styles.
- Replacing composer suggestion behavior with generic Radix Popover.
- Changing streaming, provider/model, permission, or attachment business logic.
