# U4.3 Terminal Surfaces - Implementation Plan✅

## Overview

Implement the global terminal page and shared terminal UI around OpenCode PTY only. This plan focuses on the global terminal page first; the embedded agent terminal in chat will be added in a later phase.

## Dependencies

### New npm packages required:

- `@xterm/xterm` - Terminal UI component for frontend
- `@xterm/addon-fit` - Auto-fit terminal to container

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                 │
├─────────────────────────────────────────────────────────────────┤
│  GlobalTerminalPage.tsx                                        │
│    └── TerminalTabsSurface                                     │
│          ├── TerminalTabBar                                    │
│          └── TerminalInstance                                  │
│                └── xterm.js + xterm-addon-fit                  │
├─────────────────────────────────────────────────────────────────┤
│  API Layer: api.ts                                             │
│    ├── createTerminalSession()                                 │
│    ├── listTerminalSessions()                                  │
│    ├── resizeTerminalSession(ptyId, cols, rows)                │
│    └── closeTerminalSession(ptyId)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ WebSocket / HTTP
┌─────────────────────────────────────────────────────────────────┐
│                        Backend                                  │
├─────────────────────────────────────────────────────────────────┤
│  terminal-backend.ts                                            │
│       └── OpenCodePtyBackend                                    │
│           └── Proxies to OpenCode /pty/* endpoints              │
├─────────────────────────────────────────────────────────────────┤
│  Routes: routes/terminal.ts                                     │
│    POST   /api/terminal            - Create session             │
│    GET    /api/terminal            - List sessions              │
│    GET    /api/terminal/:id        - Get session info           │
│    WS     /api/terminal/:id/connect - Attach to session        │
│    POST   /api/terminal/:id/resize - Resize terminal           │
│    DELETE /api/terminal/:id        - Close session             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Backend - OpenCode PTY Facade

### 1.1 Define terminal schemas and backend interface

**Files**:

- `packages/shared/src/schemas/terminal.ts`
- `packages/shared/src/schemas/index.ts`

Keep terminal payloads OpenCode-only:

- backend literal is `"opencode"`
- create/list/get/resize/close contracts reflect the CC terminal facade
- session shape remains minimal for now: `id`, `backend`, `cwd`, `createdAt`

### 1.2 Implement OpenCodePtyBackend

**File**: `packages/backend/src/services/terminal/opencode-pty-backend.ts`

- Create PTY session via OpenCode `/pty`
- Connect via WebSocket to `/pty/:ptyID/connect`
- Proxy input/output/resize/close to OpenCode
- Report availability from orchestrator health

### 1.3 Create terminal backend factory

**File**: `packages/backend/src/services/terminal-backend.ts`

- Expose only the OpenCode backend
- Keep one backend factory boundary so terminal UI and routes still depend on a small terminal service abstraction
- Do not auto-fallback to local shells

### 1.4 Add terminal routes

**File**: `packages/backend/src/routes/terminal.ts`

- `POST /api/terminal`
- `GET /api/terminal`
- `GET /api/terminal/:id`
- `WS /api/terminal/:id/connect`
- `POST /api/terminal/:id/resize`
- `DELETE /api/terminal/:id`

### Phase 1 Testing Strategy

**Test Files:**

- `packages/backend/test/services/terminal-backend.test.ts`
- `packages/backend/test/services/terminal/opencode-pty-backend.test.ts`
- `packages/backend/test/routes/terminal.test.ts`
- `packages/shared/test/schemas/terminal.schema.test.ts`

**What to test:**

| Component              | Test Cases                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zod Schemas**        | Valid input parsing, invalid input rejection, edge cases                                                                                       |
| **OpenCodePtyBackend** | `create()` calls OpenCode, `attach()` establishes WebSocket, `resize()` proxies correctly, `close()` terminates session, `list()` returns info |
| **Factory**            | Exposes OpenCode backend, respects availability, throws when backend unavailable                                                               |
| **Routes**             | Create/list/get/resize/close work, missing sessions return `404`, WebSocket attach proxies I/O                                                 |

---

## Phase 2: Frontend - OpenCode Terminal UI

### 2.1 Add terminal API functions

**File**: `packages/frontend/src/lib/api.ts`

- `createTerminalSession()`
- `listTerminalSessions()`
- `resizeTerminalSession()`
- `closeTerminalSession()`
- `connectTerminalWebSocket()`

### 2.2 Create `useTerminalSessions` hook

**File**: `packages/frontend/src/hooks/use-terminal-sessions.ts`

- State: sessions array, active session ID, loading/error
- Actions: create, close, setActive, resize
- No backend-selection state; all sessions are OpenCode-backed

### 2.3 Create terminal components

**Files**:

- `packages/frontend/src/components/terminal/TerminalTabBar.tsx`
- `packages/frontend/src/components/terminal/TerminalInstance.tsx`
- `packages/frontend/src/components/terminal/TerminalTabsSurface.tsx`

Requirements:

- Tabbed sessions
- Active terminal instance
- xterm initialization and cleanup
- WebSocket attach to CC terminal facade
- Resize propagation

### 2.4 Create GlobalTerminalPage

**File**: `packages/frontend/src/pages/GlobalTerminalPage.tsx`

- Replace placeholder `/terminal` route
- Use `WorkspaceLayout`
- Include terminal surface and session details panel

### Phase 2 Testing Strategy

**Test Files:**

- `packages/frontend/src/hooks/use-terminal-sessions.test.tsx`
- `packages/frontend/src/pages/GlobalTerminalPage.test.tsx`
- Additional tab bar / surface / instance tests as the UI behavior expands

**What to test:**

| Component               | Test Cases                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| **API Functions**       | create/list/resize/close call correct endpoints                                                         |
| **useTerminalSessions** | `create()` adds session, `close()` removes session, `setActive()` switches active, `resize()` calls API |
| **TerminalTabBar**      | Renders tabs, create button works, active state changes, close button removes session                   |
| **TerminalInstance**    | Connects WebSocket, writes output to xterm, sends user input, resizes, cleans up                        |
| **GlobalTerminalPage**  | Loads existing sessions, renders surface, shows active session metadata                                 |

---

## Phase 3: Integration & Polish

### 3.1 Embedded agent terminal

- Reuse the same terminal foundation in direct chat
- Scope sessions to current agent workspace
- Dock the terminal in the bottom work surface

### 3.2 Keyboard shortcuts

- Ctrl/Cmd+T: new terminal
- Ctrl/Cmd+W: close active session
- Ctrl/Cmd+Tab: next session
- Ctrl/Cmd+Shift+Tab: previous session

### 3.3 OpenCode-aligned terminal resilience

- Reconnect handling when WebSocket drops unexpectedly
- Session restoration and state hydration where feasible
- Resize smoothing and improved throughput rendering

### Phase 3 Testing Strategy

**Test Files:**

- `packages/frontend/e2e/terminal/global-terminal.spec.ts`

**What to test:**

| Feature                | Test Cases                                                                   |
| ---------------------- | ---------------------------------------------------------------------------- |
| **Routes Update**      | `/terminal` renders GlobalTerminalPage                                       |
| **Keyboard Shortcuts** | Ctrl+T creates session, Ctrl+W closes session, tab cycling works             |
| **End-to-End Flow**    | Navigate to `/terminal` → create session → type command → see output → close |
| **Reconnect Behavior** | Session remains usable or reconnects after transient attach interruption     |

---

## Deferred Future Enhancement

Local machine or emergency terminal access is intentionally deferred into a separate future epic. It should not share the same main terminal surface until its runtime model, safety posture, and UX are defined independently.

---

## File Structure (Summary)

### Backend files:

```text
packages/backend/src/
├── services/
│   ├── terminal-backend.ts
│   └── terminal/
│       └── opencode-pty-backend.ts
└── routes/
    └── terminal.ts
```

### Frontend files:

```text
packages/frontend/src/
├── components/
│   └── terminal/
│       ├── TerminalTabBar.tsx
│       ├── TerminalInstance.tsx
│       └── TerminalTabsSurface.tsx
├── hooks/
│   └── use-terminal-sessions.ts
└── pages/
    └── GlobalTerminalPage.tsx
```

---

## Implementation Order

1. **Phase 1**
   - Shared schemas
   - OpenCode backend
   - Backend facade routes

2. **Phase 2**
   - Terminal API helpers
   - Session hook
   - Tab bar / instance / surface
   - Global terminal page

3. **Phase 3**
   - Embedded agent terminal
   - Keyboard shortcuts
   - Reconnect / persistence polish
