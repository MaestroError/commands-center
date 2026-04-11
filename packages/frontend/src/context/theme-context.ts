import { createContext } from "react";

import type { ThemeName } from "@/stores/ui-store";

export type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  themes: readonly ThemeName[];
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);
