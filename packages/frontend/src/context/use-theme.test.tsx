import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThemeContext } from "./theme-context";
import { useTheme } from "./use-theme";

describe("useTheme", () => {
  it("throws when used outside the theme provider", () => {
    expect(() => renderHook(() => useTheme())).toThrowError(
      "useTheme must be used within ThemeProvider.",
    );
  });

  it("returns the current theme context value", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeContext.Provider
        value={{
          theme: "midnight",
          setTheme: () => undefined,
          resolvedTheme: { id: "midnight", name: "Midnight" },
        }}
      >
        {children}
      </ThemeContext.Provider>
    );

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("midnight");
    expect(result.current.resolvedTheme).toEqual({ id: "midnight", name: "Midnight" });
  });
});
