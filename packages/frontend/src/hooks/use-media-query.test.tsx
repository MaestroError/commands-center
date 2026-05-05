import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "./use-media-query";

type MatchMediaListener = (event: MediaQueryListEvent) => void;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMediaQuery", () => {
  it("returns false when matchMedia is unavailable", () => {
    vi.stubGlobal("window", { ...window, matchMedia: undefined });

    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));

    expect(result.current).toBe(false);
  });

  it("returns false when matchMedia returns null", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(null as unknown as MediaQueryList));

    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));

    expect(result.current).toBe(false);
  });

  it("tracks media query changes and removes the listener on unmount", () => {
    let listener: MatchMediaListener | undefined;
    const addEventListener = vi.fn((_: string, nextListener: MatchMediaListener) => {
      listener = nextListener;
    });
    const removeEventListener = vi.fn();

    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        media: "(min-width: 768px)",
        onchange: null,
        addEventListener,
        removeEventListener,
        dispatchEvent: vi.fn(),
      } satisfies MediaQueryList),
    );

    const { result, unmount } = renderHook(() => useMediaQuery("(min-width: 768px)"));

    expect(result.current).toBe(false);
    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

    act(() => {
      listener?.({ matches: true } as MediaQueryListEvent);
    });

    expect(result.current).toBe(true);

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
