import { create } from "zustand";

import {
  COLOR_MODE_STORAGE_KEY,
  readColorModePreference,
  type ColorModePreference,
} from "@/lib/appearance";

type UiState = {
  colorModePreference: ColorModePreference;
  setColorModePreference: (preference: ColorModePreference) => void;
};

export const useUiStore = create<UiState>((set: (partial: Partial<UiState>) => void) => ({
  colorModePreference: readColorModePreference(getBrowserStorage()),
  setColorModePreference: (preference: ColorModePreference) => {
    const storage = getBrowserStorage();

    if (storage) {
      persistColorModePreference(storage, preference);
    }

    set({ colorModePreference: preference });
  },
}));

export type { UiState };

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return typeof window.localStorage?.getItem === "function" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function persistColorModePreference(storage: Storage, preference: ColorModePreference): void {
  try {
    storage.setItem(COLOR_MODE_STORAGE_KEY, preference);
  } catch {
    return;
  }
}
