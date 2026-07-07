// Session-scoped handoff for prefilling a terminal with a command. The activity
// feed's "Run command" action navigates to /terminal, which opens a fresh
// session and stores the command under that session's id here. The matching
// terminal instance consumes it once connected and writes it to the PTY
// (without a trailing newline) so the operator reviews and presses Enter.
//
// Scoping by session id ensures the command lands in the newly opened terminal
// and cannot be swallowed by a pre-existing session connecting at the same time.
function storageKey(sessionId: string): string {
  return `cc.terminal.prefill.${sessionId}`;
}

export function setSessionPrefillCommand(sessionId: string, command: string): void {
  try {
    window.sessionStorage.setItem(storageKey(sessionId), command);
  } catch {
    // Ignore storage failures (private mode, quota); prefill just won't happen.
  }
}

/** Read and clear the pending command for a session, if any. */
export function consumeSessionPrefillCommand(sessionId: string): string | undefined {
  try {
    const command = window.sessionStorage.getItem(storageKey(sessionId));
    if (command) {
      window.sessionStorage.removeItem(storageKey(sessionId));
      return command;
    }
  } catch {
    // Ignore storage failures.
  }
  return undefined;
}
