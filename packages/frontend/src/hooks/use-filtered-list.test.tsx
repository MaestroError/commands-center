import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useFilteredList } from "./use-filtered-list";

describe("useFilteredList", () => {
  it("returns static items when there is no query and filters string values when present", () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useFilteredList({
        items: [
          { id: 1, label: "Alpha" },
          { id: 2, label: "Beta" },
          { id: 3, label: 42 as unknown as string },
        ],
        filterKey: "label",
        onSelect,
      }),
    );

    expect(result.current.filtered).toEqual([
      { id: 1, label: "Alpha" },
      { id: 2, label: "Beta" },
      { id: 3, label: 42 },
    ]);

    act(() => {
      result.current.setQuery("alp");
    });

    expect(result.current.filtered).toEqual([{ id: 1, label: "Alpha" }]);
  });

  it("loads async items, keeps only the latest fetch, and clears loading state on failure", async () => {
    let resolveFirst: ((items: Array<{ id: number; label: string }>) => void) | undefined;
    let resolveSecond: ((items: Array<{ id: number; label: string }>) => void) | undefined;
    const items = vi
      .fn<(query: string) => Promise<Array<{ id: number; label: string }>>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("nope"));

    const { result } = renderHook(() =>
      useFilteredList({
        items,
        filterKey: "label",
        onSelect: vi.fn(),
      }),
    );

    expect(result.current.isLoading).toBe(true);

    act(() => {
      result.current.setQuery("new");
    });

    await waitFor(() => {
      expect(items).toHaveBeenCalledWith("");
      expect(items).toHaveBeenCalledWith("new");
    });

    resolveFirst?.([{ id: 1, label: "old" }]);
    resolveSecond?.([{ id: 2, label: "new" }]);

    await waitFor(() => {
      expect(result.current.filtered).toEqual([{ id: 2, label: "new" }]);
      expect(result.current.activeIndex).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setQuery("broken");
    });

    await waitFor(() => {
      expect(result.current.filtered).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("selects active items and handles keyboard navigation branches", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useFilteredList({
        items: [
          { id: 1, label: "Alpha" },
          { id: 2, label: "Beta" },
        ],
        filterKey: "label",
        onSelect,
        onClose,
      }),
    );

    act(() => {
      result.current.onKeyDown(createKeyEvent("ArrowDown"));
    });
    expect(result.current.activeIndex).toBe(1);

    act(() => {
      result.current.onKeyDown(createKeyEvent("ArrowUp"));
    });
    expect(result.current.activeIndex).toBe(0);

    act(() => {
      result.current.onKeyDown(createKeyEvent("Enter"));
      result.current.onKeyDown(createKeyEvent("Tab"));
      result.current.onKeyDown(createKeyEvent("Escape"));
    });

    expect(onSelect).toHaveBeenNthCalledWith(1, { id: 1, label: "Alpha" });
    expect(onSelect).toHaveBeenNthCalledWith(2, { id: 1, label: "Alpha" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.onKeyDown(createKeyEvent("x"))).toBe(false);

    act(() => {
      result.current.setQuery("zzz");
    });

    expect(result.current.onKeyDown(createKeyEvent("Enter"))).toBe(false);
    expect(result.current.onKeyDown(createKeyEvent("Tab"))).toBe(false);
    act(() => {
      result.current.setActiveIndex(99);
      result.current.selectActive();
    });

    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

function createKeyEvent(key: string): React.KeyboardEvent {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent;
}
