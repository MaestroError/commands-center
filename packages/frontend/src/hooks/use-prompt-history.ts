import { useState, useCallback, useRef, useEffect } from "react";

const MAX_HISTORY_ENTRIES = 100;
const STORAGE_KEY_NORMAL = "cc-prompt-history";
const STORAGE_KEY_SHELL = "cc-shell-history";

interface PromptHistoryEntry {
  text: string;
  timestamp: number;
}

interface NavigationResult {
  handled: boolean;
  entry: string | null;
  cursor: "start" | "end";
}

function getStorageKey(mode: "normal" | "shell"): string {
  return mode === "shell" ? STORAGE_KEY_SHELL : STORAGE_KEY_NORMAL;
}

function loadEntries(mode: "normal" | "shell"): PromptHistoryEntry[] {
  try {
    const stored = localStorage.getItem(getStorageKey(mode));
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is PromptHistoryEntry => {
          if (typeof entry !== "object" || entry === null) {
            return false;
          }
          const obj = entry as Record<string, unknown>;
          return typeof obj["text"] === "string" && typeof obj["timestamp"] === "number";
        });
      }
    }
  } catch {
    // Ignore storage errors
  }
  return [];
}

function saveEntries(mode: "normal" | "shell", entries: PromptHistoryEntry[]): void {
  try {
    localStorage.setItem(
      getStorageKey(mode),
      JSON.stringify(entries.slice(0, MAX_HISTORY_ENTRIES)),
    );
  } catch {
    // Ignore storage errors
  }
}

export function usePromptHistory(mode: "normal" | "shell") {
  const [entries, setEntries] = useState<PromptHistoryEntry[]>(() => loadEntries(mode));
  const [historyIndex, setHistoryIndex] = useState(-1);
  const savedDraftRef = useRef<string | null>(null);

  // Reload entries when mode changes
  useEffect(() => {
    setEntries(loadEntries(mode));
    setHistoryIndex(-1);
    savedDraftRef.current = null;
  }, [mode]);

  const addEntry = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Don't add duplicates of the most recent entry
      const current = loadEntries(mode);
      if (current.length > 0 && current[0]?.text === trimmed) {
        return;
      }

      const newEntry: PromptHistoryEntry = {
        text: trimmed,
        timestamp: Date.now(),
      };

      const updated = [newEntry, ...current].slice(0, MAX_HISTORY_ENTRIES);
      setEntries(updated);
      saveEntries(mode, updated);

      // Reset navigation state after adding
      setHistoryIndex(-1);
      savedDraftRef.current = null;
    },
    [mode],
  );

  const navigate = useCallback(
    (direction: "up" | "down", currentText: string, cursorPosition: number): NavigationResult => {
      const textLength = currentText.length;
      const atStart = cursorPosition === 0;
      const atEnd = cursorPosition === textLength;
      const inHistory = historyIndex >= 0;

      // Determine if we can navigate
      if (direction === "up") {
        // Can only start navigating up when input is empty and cursor at start
        if (!inHistory && !(atStart && textLength === 0)) {
          return { handled: false, entry: null, cursor: "start" };
        }
        // Already at oldest entry
        if (inHistory && historyIndex >= entries.length - 1) {
          return { handled: false, entry: null, cursor: "start" };
        }
      } else {
        // direction === "down"
        // Can navigate down when in history and at end of text
        if (!inHistory) {
          return { handled: false, entry: null, cursor: "end" };
        }
        if (inHistory && !(atStart || atEnd)) {
          return { handled: false, entry: null, cursor: "end" };
        }
      }

      if (direction === "up") {
        if (historyIndex === -1) {
          // First time navigating: save current draft and go to most recent entry
          if (entries.length === 0) {
            return { handled: false, entry: null, cursor: "start" };
          }
          savedDraftRef.current = currentText;
          setHistoryIndex(0);
          return { handled: true, entry: entries[0]?.text ?? "", cursor: "start" };
        } else {
          // Go deeper into history
          const nextIndex = historyIndex + 1;
          setHistoryIndex(nextIndex);
          return { handled: true, entry: entries[nextIndex]?.text ?? "", cursor: "start" };
        }
      } else {
        // direction === "down"
        if (historyIndex > 0) {
          // Go to more recent entry
          const nextIndex = historyIndex - 1;
          setHistoryIndex(nextIndex);
          return { handled: true, entry: entries[nextIndex]?.text ?? "", cursor: "end" };
        } else {
          // At index 0, restore saved draft
          setHistoryIndex(-1);
          const draft = savedDraftRef.current ?? "";
          savedDraftRef.current = null;
          return { handled: true, entry: draft, cursor: "end" };
        }
      }
    },
    [entries, historyIndex],
  );

  const reset = useCallback(() => {
    setHistoryIndex(-1);
    savedDraftRef.current = null;
  }, []);

  return {
    entries,
    addEntry,
    navigate,
    reset,
    isNavigating: historyIndex >= 0,
  };
}
