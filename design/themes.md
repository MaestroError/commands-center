# Themes

## Recommendation

CommandsCenter should support a small built-in theming system from the start, but keep layout and component behavior consistent across all themes.

- Use one shared app shell and one shared component system.
- Use semantic design tokens instead of hardcoded colors.
- Keep all themes productivity-first because the product is a dense operator tool, not a marketing site.

## Built-in Themes

### 1. Light

- Description: Clean, calm, and practical default theme for general daily use.
- Direction: Soft neutral backgrounds, strong text contrast, restrained accent colors, comfortable panel separation.
- Decision: This should be the default MVP theme.

### 2. Dark

- Description: Low-glare theme for long chat, terminal, and file editing sessions.
- Direction: Charcoal/slate surfaces instead of pure black, clear contrast, muted accents, readable code and terminal colors.
- Decision: This should be the main alternative for power users.

### 3. Modern

- Description: More branded and expressive theme with richer accents and slightly more atmosphere.
- Direction: Tinted surfaces, stronger accent presence, subtle gradients, premium look without hurting readability.
- Decision: This should feel polished and distinctive, but still serious and productivity-safe.

## Theme System Rules

- Themes should change visual mood, not layout or information architecture.
- Chat, file manager, terminal, forms, and settings should work identically in every theme.
- Avoid extreme saturation, neon colors, pure white, and pure black.
- Keep long-session readability as the top priority.

## Semantic Tokens

Suggested token groups:

- App background
- Surface background
- Elevated surface background
- Sidebar background
- Border / divider
- Primary text
- Secondary / muted text
- Accent
- Accent hover / active
- Selection / focus ring
- Success / warning / danger / info
- Chat user bubble
- Chat agent bubble
- Terminal background / terminal foreground

## MVP Decision

- Ship `Light`, `Dark`, and `Modern`.
- Keep one shared layout across all themes.
- Put theme selection in Settings.
- Persist the selected theme as part of user/app UI state.
