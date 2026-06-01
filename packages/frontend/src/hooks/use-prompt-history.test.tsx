import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePromptHistory } from "./use-prompt-history";

describe("usePromptHistory", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("loads only valid entries from storage", () => {
    window.localStorage.setItem(
      "cc-prompt-history",
      JSON.stringify([
        { text: "valid", timestamp: 1 },
        { text: 123, timestamp: 2 },
        null,
        { text: "missing timestamp" },
      ]),
    );

    const { result } = renderHook(() => usePromptHistory("normal"));

    expect(result.current.entries).toEqual([{ text: "valid", timestamp: 1 }]);
  });

  it("ignores invalid storage JSON", () => {
    window.localStorage.setItem("cc-prompt-history", "not-json");

    const { result } = renderHook(() => usePromptHistory("normal"));

    expect(result.current.entries).toEqual([]);
  });

  it("adds trimmed entries and skips blank or duplicate latest entries", () => {
    vi.spyOn(Date, "now").mockReturnValue(123);
    const { result } = renderHook(() => usePromptHistory("normal"));

    act(() => {
      result.current.addEntry("  first prompt  ");
      result.current.addEntry("first prompt");
      result.current.addEntry("   ");
    });

    expect(result.current.entries).toEqual([{ text: "first prompt", timestamp: 123 }]);
    expect(JSON.parse(window.localStorage.getItem("cc-prompt-history") ?? "[]")).toEqual([
      { text: "first prompt", timestamp: 123 },
    ]);
  });

  it("keeps normal and shell history separate", () => {
    const { result, rerender } = renderHook(
      ({ mode }: { mode: "normal" | "shell" }) => usePromptHistory(mode),
      { initialProps: { mode: "normal" as "normal" | "shell" } },
    );

    act(() => {
      result.current.addEntry("normal prompt");
    });
    rerender({ mode: "shell" });
    act(() => {
      result.current.addEntry("pnpm test");
    });

    expect(window.localStorage.getItem("cc-prompt-history")).toContain("normal prompt");
    expect(window.localStorage.getItem("cc-shell-history")).toContain("pnpm test");
    expect(result.current.entries.map((entry) => entry.text)).toEqual(["pnpm test"]);
  });

  it("navigates up and down through stored entries", () => {
    window.localStorage.setItem(
      "cc-prompt-history",
      JSON.stringify([
        { text: "latest", timestamp: 2 },
        { text: "oldest", timestamp: 1 },
      ]),
    );
    const { result } = renderHook(() => usePromptHistory("normal"));

    let first!: ReturnType<typeof result.current.navigate>;
    act(() => {
      first = result.current.navigate("up", "", 0);
    });
    expect(first).toEqual({ handled: true, entry: "latest", cursor: "start" });
    expect(result.current.isNavigating).toBe(true);

    let second!: ReturnType<typeof result.current.navigate>;
    act(() => {
      second = result.current.navigate("up", "latest", 0);
    });
    expect(second).toEqual({ handled: true, entry: "oldest", cursor: "start" });

    let blockedAtOldest!: ReturnType<typeof result.current.navigate>;
    act(() => {
      blockedAtOldest = result.current.navigate("up", "oldest", 0);
    });
    expect(blockedAtOldest).toEqual({ handled: false, entry: null, cursor: "start" });

    let newer!: ReturnType<typeof result.current.navigate>;
    act(() => {
      newer = result.current.navigate("down", "oldest", "oldest".length);
    });
    expect(newer).toEqual({ handled: true, entry: "latest", cursor: "end" });

    let restoredDraft!: ReturnType<typeof result.current.navigate>;
    act(() => {
      restoredDraft = result.current.navigate("down", "latest", "latest".length);
    });
    expect(restoredDraft).toEqual({ handled: true, entry: "", cursor: "end" });
  });

  it("does not navigate from the middle of current text", () => {
    const { result } = renderHook(() => usePromptHistory("normal"));

    act(() => {
      result.current.addEntry("stored prompt");
    });

    expect(result.current.navigate("up", "draft", 2)).toEqual({
      handled: false,
      entry: null,
      cursor: "start",
    });
    expect(result.current.navigate("down", "draft", 2)).toEqual({
      handled: false,
      entry: null,
      cursor: "end",
    });
  });

  it("resets active navigation state", () => {
    window.localStorage.setItem(
      "cc-prompt-history",
      JSON.stringify([{ text: "stored prompt", timestamp: 1 }]),
    );
    const { result } = renderHook(() => usePromptHistory("normal"));

    act(() => {
      result.current.navigate("up", "", 0);
      result.current.reset();
    });

    expect(result.current.isNavigating).toBe(false);
  });
});
