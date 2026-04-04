# Layout

## Core Approach

CommandsCenter should use a simple global app shell and a flexible page-level workspace layout.

- Global shell stays stable across the app.
- Complex panel behavior belongs inside the main content area, not as fixed shell regions.
- Each page can inject its own context panel, bottom drawer, and tab structure as needed.

## Global App Shell

- Left sidebar for primary navigation and agent shortcuts.
- Top header for page title, page actions, and profile access.
- Main content area for page-specific layouts.

## Sidebar Structure

The left sidebar contains two regions: primary navigation links and an agents shortcut section.

### Navigation Links

- Links to each main screen: Dashboard, Agents, File Manager, Global Terminal, Automations, Custom Tools, Built-in Skills, Integrations, Provider Connections, Settings.
- The active screen link is visually highlighted.

### Agents Section

- The section is titled **Agents** and acts as a quick-access area, not a navigation group.
- Shows up to **3 most recent agents** the user has had a direct chat with, ordered by last chat activity.
- Each agent entry shows the agent's icon and name and opens that agent's direct chat when selected.
- Below the recent agents, a **See all** link navigates to the full Agents screen.
- If no agents have been chatted with yet, the section shows an empty state or is hidden until a first chat occurs.

## Main Content Workspace

The main content area should be a reusable flexible panel system.

- It can contain the primary content area, optional context panel, and optional bottom panel.
- All of these should be controlled at the page level.
- This layout should support resize, collapse, restore, and tabs.

## Panel Model

### Primary Pane

- Holds the main page content.
- Can also have its own internal tabs when a page needs them.
    - Example: Integrations page can use top-level tabs such as `Apps` and `MCPs`.
- Can also be splitted flexibly (resizable columns) into 2-4 parts

### Context Pane

- Optional side pane injected by the active page.
- Used for contextual secondary content such as files, tools, attachments, preview, or metadata.
- Should be resizable against the primary pane.
- Should support tabs.

### Bottom Pane

- Optional bottom area injected by the active page.
- Used for terminal sessions and other horizontally oriented work surfaces.
- Should be resizable against the primary pane.
- Should support multiple tabs, such as several terminal sessions.

## Behavior Rules

- Panels should be collapsible and restorable.
- Tabs should be supported in the main content area, context pane, and bottom pane where useful.
- Multiple terminal sessions should be handled as tabs, not separate screens.
- MVP should support docked panels with tabs and resizing.
- Full floating/detached window management is post-MVP.

## Desktop Behavior

- Use docked multi-pane layouts.
- Allow side-by-side and bottom panel compositions.
- Support drag resizing between panes.
- Keep interactions consistent across chat, file manager, and other advanced pages.

## Mobile Behavior

- Do not show multiple panes side by side by default.
- Keep one primary view visible at a time.
- Render context pane as a sheet/overlay instead of a docked side panel.
- Render bottom pane as a bottom sheet or full-height mobile panel.
- Keep tabs touch-friendly and easy to switch.
- Preserve the same information architecture, but adapt the presentation for small screens.

## Page Examples

### Direct Chat

- Primary pane: chat conversation.
- Context pane tabs: workspace files, tools, attachments.
- Bottom pane tabs: terminal sessions.

### File Manager

- Primary pane: file browser and editor experience.
- Context pane: preview, metadata, or file actions if needed.
- Bottom pane: optional terminal or future activity panel.

### Integrations

- Primary pane: Composio integrations section followed by MCP servers section (or tabs: `Composio Apps` and `MCP Servers`).
- Additional panels only when needed.

## MVP Decisions

- Use one stable app shell.
- Use one reusable workspace layout component inside main content.
- Support page-level injection of context and bottom panels.
- Support tabs in both page content and auxiliary panels.
- Support resizing, collapsing, and restoring docked panes.
- On mobile, convert auxiliary panes into overlays/sheets.
- Do not implement full floating windows in MVP.
