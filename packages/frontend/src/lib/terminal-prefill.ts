// A one-shot handoff for prefilling the global terminal with a command. The
// activity feed's "Run command" action stores a command here and navigates to
// /terminal; the terminal instance consumes it once connected and writes it to
// the PTY (without a trailing newline) so the operator reviews and presses Enter.
const STORAGE_KEY = "cc.terminal.pending-command";

export function setPendingTerminalCommand(command: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, command);
  } catch {
    // Ignore storage failures (private mode, quota); prefill just won't happen.
  }
}

/** Read and clear the pending command, if any. */
export function consumePendingTerminalCommand(): string | undefined {
  try {
    const command = window.sessionStorage.getItem(STORAGE_KEY);
    if (command) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return command;
    }
  } catch {
    // Ignore storage failures.
  }
  return undefined;
}
