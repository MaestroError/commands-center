import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";

import {
  applyAppearance,
  colorModePreferences,
  readSystemColorMode,
  resolveColorMode,
  COLOR_MODE_MEDIA_QUERY,
  DEFAULT_THEME_ID,
  type ResolvedColorMode,
} from "@/lib/appearance";
import { useUiStore, type UiState } from "@/stores/ui-store";

import { ThemeContext } from "./theme-context";

export function ThemeProvider(props: { children: ReactNode }) {
  const colorModePreference = useUiStore((state: UiState) => state.colorModePreference);
  const setColorModePreference = useUiStore((state: UiState) => state.setColorModePreference);
  const [systemColorMode, setSystemColorMode] = useState<ResolvedColorMode>(readSystemColorMode);
  const resolvedColorMode = resolveColorMode(colorModePreference, systemColorMode);

  useLayoutEffect(() => {
    applyAppearance(colorModePreference, systemColorMode);
  }, [colorModePreference, systemColorMode]);

  useEffect(() => {
    if (colorModePreference !== "system" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(COLOR_MODE_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setSystemColorMode(event.matches ? "dark" : "light");
    };

    setSystemColorMode(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", onChange);

    return () => mediaQuery.removeEventListener("change", onChange);
  }, [colorModePreference]);

  return (
    <ThemeContext.Provider
      value={{
        colorModePreference,
        colorModePreferences,
        resolvedColorMode,
        setColorModePreference,
        theme: DEFAULT_THEME_ID,
      }}
    >
      {props.children}
    </ThemeContext.Provider>
  );
}
