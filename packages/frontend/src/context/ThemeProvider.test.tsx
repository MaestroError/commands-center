import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUiStore } from "@/stores/ui-store";

import { ThemeProvider } from "./ThemeProvider";
import { useTheme } from "./use-theme";

describe("ThemeProvider", () => {
  beforeEach(() => {
    useUiStore.setState({ colorModePreference: "system" });
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-color-mode");
    document.documentElement.style.colorScheme = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies the system-resolved appearance and responds to OS changes", () => {
    const mediaQuery = createMediaQuery(false);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQuery.value),
    );

    render(
      <ThemeProvider>
        <AppearanceOutput />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("resolved-color-mode")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "default");
    expect(document.documentElement).toHaveAttribute("data-color-mode", "light");
    expect(document.documentElement.style.colorScheme).toBe("light");

    act(() => mediaQuery.dispatch(true));

    expect(screen.getByTestId("resolved-color-mode")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-color-mode", "dark");
  });

  it("ignores OS changes when an explicit color mode is selected", () => {
    const mediaQuery = createMediaQuery(false);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQuery.value),
    );
    useUiStore.setState({ colorModePreference: "dark" });

    render(
      <ThemeProvider>
        <AppearanceOutput />
      </ThemeProvider>,
    );

    act(() => mediaQuery.dispatch(false));

    expect(screen.getByTestId("resolved-color-mode")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-color-mode", "dark");
    expect(mediaQuery.listeners).toHaveLength(0);
  });
});

function AppearanceOutput() {
  const { resolvedColorMode } = useTheme();

  return <output data-testid="resolved-color-mode">{resolvedColorMode}</output>;
}

function createMediaQuery(initialMatches: boolean): {
  dispatch: (matches: boolean) => void;
  listeners: Set<(event: MediaQueryListEvent) => void>;
  value: MediaQueryList;
} {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const value = {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "change" && typeof listener === "function") {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    },
    matches: initialMatches,
    media: "(prefers-color-scheme: dark)",
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "change" && typeof listener === "function") {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    },
  } as MediaQueryList;

  return {
    dispatch: (matches: boolean) => {
      Object.defineProperty(value, "matches", { configurable: true, value: matches });
      const event = { matches } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
    listeners,
    value,
  };
}
