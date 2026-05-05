import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { themeNames } from "@/stores/ui-store";

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
          theme: "modern",
          setTheme: () => undefined,
          themes: themeNames,
        }}
      >
        {children}
      </ThemeContext.Provider>
    );

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("modern");
    expect(result.current.themes).toEqual(themeNames);
  });
});
