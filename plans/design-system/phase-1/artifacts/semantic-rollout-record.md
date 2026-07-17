# Phase 1 Semantic HTML Rollout Record

Implements [DS-0103](../03-semantic-base-guardrails.md),
[DS-0104](../04-semantic-typography.md),
[DS-0105](../05-semantic-lists.md), and
[DS-0106](../06-semantic-structures.md).

## Delivery

Generic CC HTML defaults are in `@layer base` and apply only to unclassed
semantic elements. The rollout includes inherited text, links and focus,
headings, paragraphs, separators, ordered/unordered/description lists,
blockquotes, code/preformatted content, tables, and inline annotation and edit
elements.

Explicit Tailwind utilities and `cc-*` component classes retain precedence. The
base selectors explicitly exclude `.cc-md`, Milkdown, Monaco, and xterm
contexts, while Markdown and editor-specific styles retain their existing
ownership.

## Overflow policy

- Paragraphs, links, list items, and table cells may break long unbroken text.
- `pre` may scroll locally rather than widening the document.
- Tables stay contained within their parent width and permit local horizontal
  access when content cannot reasonably wrap.
- Images are constrained to their containing width.

The Phase 1 semantic fixture has no page-level horizontal overflow at 390px.
The application shell is tested separately at 320px and 390px.

## Protected behavior

Reader and chat Markdown keep their scoped `.cc-md` treatment. Milkdown keeps
its editor-owned presentation and behavior. Markdown table source continues to
render exactly as it did before this phase; GFM table support was not enabled.
Third-party editor surfaces are excluded rather than broadly reset.
