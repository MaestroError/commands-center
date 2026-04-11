import { create } from "zustand";

export const themeNames = ["light", "dark", "modern"] as const;

export type ThemeName = (typeof themeNames)[number];

type UiState = {
  theme: ThemeName;
  mobileSidebarOpen: boolean;
  setTheme: (theme: ThemeName) => void;
  setMobileSidebarOpen: (open: boolean) => void;
};

export const THEME_STORAGE_KEY = "cc.theme";

export const useUiStore = create<UiState>((set: (partial: Partial<UiState>) => void) => ({
  theme: readStoredTheme(),
  mobileSidebarOpen: false,
  setTheme: (theme: ThemeName) => {
    if (hasStorage()) {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }

    set({ theme });
  },
  setMobileSidebarOpen: (mobileSidebarOpen: boolean) => set({ mobileSidebarOpen }),
}));

export type { UiState };

function readStoredTheme(): ThemeName {
  if (!hasStorage()) {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

  return isThemeName(storedTheme) ? storedTheme : "light";
}

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && themeNames.includes(value as ThemeName);
}

function hasStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage?.getItem === "function" &&
    typeof window.localStorage?.setItem === "function"
  );
}
