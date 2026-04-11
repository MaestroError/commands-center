# U0 Frontend Foundation

## Outcome

The frontend has a complete app shell, responsive panel layout system, semantic theming infrastructure, and shared primitives that all subsequent UI epics build on top of.

## Why this is a separate PR

Every UI epic needs routing, layout panels, theme tokens, and data-fetching conventions. Shipping these as a standalone foundation prevents each feature PR from reinventing structure and ensures visual and behavioral consistency from the start.

## Blockers

- E3 API and Realtime Foundation

## Unblocks

- U1 App Shell and Dashboard
- U2 Agents and Agent Editor
- U3 Direct Chat Screen
- U4 File Manager and Terminals
- U5 Profile, Settings, and Theming

## Scope

### App Shell (from `design/layout.md`)

- Build the global app shell: left sidebar, top header, main content area
- Implement sidebar with two regions:
  - Navigation links: Dashboard, Agents, File Manager, Global Terminal, Automations, Custom Tools, Built-in Skills, Integrations, Provider Connections, Settings
  - Agents section: up to 3 most recent agents (icon + name, opens direct chat), "See all" link to Agents screen, empty state when no chat history exists
- Implement top header: page title, page actions area, profile access
- Implement routing structure for all screens listed in `design/list_screens.md`
- Active navigation link is visually highlighted

### Responsive Panel Layout System (from `design/layout.md`)

- Build reusable workspace layout component for the main content area
- Support primary pane, optional context pane, and optional bottom pane
- Context pane: resizable against primary, supports tabs, page-level injection
- Bottom pane: resizable against primary, supports tabs (e.g. terminal sessions), page-level injection
- All panels support collapse, restore, and resize
- Desktop: docked multi-pane layouts with drag resizing
- Mobile: single primary view, context pane as sheet/overlay, bottom pane as bottom sheet or full-height panel, touch-friendly tabs

### Semantic Theme System (from `design/themes.md`)

- Implement semantic design token system with CSS custom properties via Tailwind CSS v4 `@theme {}` blocks
- Define all semantic tokens: app background, surface, elevated surface, sidebar background, border, primary and secondary text, accent, accent hover/active, selection, focus ring, success, warning, danger, info, chat user and agent bubbles, terminal background and foreground
- Implement three built-in themes: Light (default), Dark, Modern
- Build theme provider that applies themes without page reload
- Themes change visual mood only — layout and information architecture stay identical across all themes

### Shared Frontend Primitives

- Add shared data-fetching primitives (API client, query patterns)
- Add page-level state handling conventions
- Add loading, error, and empty state components
- Establish component patterns for consistent use across all screens

## Acceptance Criteria

- The app renders a global shell with sidebar navigation, top header, and main content area matching `design/layout.md`
- Sidebar shows navigation links to all screens from `design/list_screens.md` with active state highlighting
- Sidebar shows recent agents section with up to 3 agents or an appropriate empty state
- Top header displays page title and provides profile access
- The responsive panel system supports primary, context, and bottom panes with resize, collapse, restore, and tabs
- Desktop renders docked side-by-side and bottom panel compositions with drag resizing
- Mobile renders single primary view with context pane as overlay/sheet and bottom pane as bottom sheet, with touch-friendly tabs
- Three themes (Light, Dark, Modern) render correctly using semantic design tokens
- Theme changes apply immediately across the entire application without page reload
- Shared data-fetching and state primitives are established and usable by subsequent epics
- Loading, error, and empty states are available as shared components
- Use packages listed in GOAL.md

## Non-Goals

- Dashboard content (cards, health data, quick actions) — owned by U1
- Profile and settings screens — owned by U5
- Theme persistence to database — owned by U5 (U0 uses a sensible default or local state)
- Any product screen implementation beyond the shell and placeholder routes
