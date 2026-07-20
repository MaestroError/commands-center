import { createContext } from "react";

import type { ColorModePreference, ResolvedColorMode, ThemeId } from "@/lib/appearance";

export type ThemeContextValue = {
  colorModePreference: ColorModePreference;
  colorModePreferences: readonly ColorModePreference[];
  resolvedColorMode: ResolvedColorMode;
  setColorModePreference: (preference: ColorModePreference) => void;
  theme: ThemeId;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);
