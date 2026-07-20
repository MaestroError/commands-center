import { describe, expect, it } from "vitest";

import {
  COLOR_MODE_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  migrateLegacyTheme,
  readColorModePreference,
  resolveColorMode,
} from "./appearance";

describe("appearance", () => {
  it("resolves every explicit and system preference", () => {
    expect(resolveColorMode("light", "light")).toBe("light");
    expect(resolveColorMode("light", "dark")).toBe("light");
    expect(resolveColorMode("dark", "light")).toBe("dark");
    expect(resolveColorMode("dark", "dark")).toBe("dark");
    expect(resolveColorMode("system", "light")).toBe("light");
    expect(resolveColorMode("system", "dark")).toBe("dark");
  });

  it("maps legacy theme values to color-mode preferences", () => {
    expect(migrateLegacyTheme("light")).toBe("light");
    expect(migrateLegacyTheme("dark")).toBe("dark");
    expect(migrateLegacyTheme("modern")).toBe("dark");
    expect(migrateLegacyTheme("invalid")).toBeNull();
    expect(migrateLegacyTheme(null)).toBeNull();
  });

  it("keeps a valid persisted color-mode preference", () => {
    const storage = createMemoryStorage({
      [COLOR_MODE_STORAGE_KEY]: "system",
      [LEGACY_THEME_STORAGE_KEY]: "dark",
    });

    expect(readColorModePreference(storage)).toBe("system");
    expect(storage.getItem(LEGACY_THEME_STORAGE_KEY)).toBe("dark");
  });

  it("migrates a legacy Modern value when color-mode is absent", () => {
    const storage = createMemoryStorage({ [LEGACY_THEME_STORAGE_KEY]: "modern" });

    expect(readColorModePreference(storage)).toBe("dark");
    expect(storage.getItem(COLOR_MODE_STORAGE_KEY)).toBe("dark");
    expect(storage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull();
  });

  it("uses System when stored values are invalid", () => {
    const storage = createMemoryStorage({
      [COLOR_MODE_STORAGE_KEY]: "violet",
      [LEGACY_THEME_STORAGE_KEY]: "unknown",
    });

    expect(readColorModePreference(storage)).toBe("system");
    expect(storage.getItem(COLOR_MODE_STORAGE_KEY)).toBe("system");
    expect(storage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull();
  });

  it("uses System when browser storage is unavailable", () => {
    expect(readColorModePreference(null)).toBe("system");
  });
});

function createMemoryStorage(initialValues: Record<string, string>): Storage {
  const values = new Map(Object.entries(initialValues));

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}
