import { useEffect, type ReactNode } from "react";

import { themeNames, useUiStore, type UiState } from "@/stores/ui-store";

import { ThemeContext } from "./theme-context";

export function ThemeProvider(props: { children: ReactNode }) {
  const theme = useUiStore((state: UiState) => state.theme);
  const setTheme = useUiStore((state: UiState) => state.setTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: themeNames }}>
      {props.children}
    </ThemeContext.Provider>
  );
}
