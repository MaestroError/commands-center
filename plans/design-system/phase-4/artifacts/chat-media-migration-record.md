# Chat and Media Migration Record (DS-0408)

- Task: [DS-0408](../08-chat-media.md)
- Protected contract: `.cc-md` and `.cc-md--chat` styles and renderer structure remain frozen.

## Decisions and deltas

- Raw palette occurrences: **18 → 0** across chat status and identity chrome.
- Equivalent glyphs in AttachmentBar, AutoApproveToggle, ChatComposer, ChatHeader, ConversationHistoryModal, CopyIdButton, FileMentionPopover, Markdown copy action, MediaTab, ModelSelector, and UserMessage now use Lucide.
- Inline-SVG files in the chat domain: **10 → 0**. The Markdown change is glyph-only; no protected CSS or content markup was changed.
- Skill identity uses accent, shell/file context uses information, auto-approval/attachment attention uses warning, and copy success uses success.
- ModelSelector and file/slash/specialist suggestion behavior remain domain-owned. No generic focus-moving Popover was introduced.
- Streaming, messages/tools, attachments, conversations, permissions, prompt history, and retry behavior were not changed.

Verification is owned by the chat/component suites, `e2e/chat.spec.ts`, `e2e/chat-mentions.spec.ts`, and protected Markdown baselines.
