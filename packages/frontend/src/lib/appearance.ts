export const DEFAULT_THEME_ID = "default";
export const COLOR_MODE_STORAGE_KEY = "cc.color-mode";
export const LEGACY_THEME_STORAGE_KEY = "cc.theme";
export const COLOR_MODE_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export const colorModePreferences = ["light", "dark", "system"] as const;

export type ThemeId = typeof DEFAULT_THEME_ID;
export type ColorModePreference = (typeof colorModePreferences)[number];
export type ResolvedColorMode = Exclude<ColorModePreference, "system">;

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function isColorModePreference(value: string | null): value is ColorModePreference {
  return value !== null && colorModePreferences.includes(value as ColorModePreference);
}

export function resolveColorMode(
  preference: ColorModePreference,
  systemColorMode: ResolvedColorMode,
): ResolvedColorMode {
  return preference === "system" ? systemColorMode : preference;
}

export function migrateLegacyTheme(value: string | null): ColorModePreference | null {
  if (value === "light" || value === "dark") {
    return value;
  }

  if (value === "modern") {
    return "dark";
  }

  return null;
}

export function readColorModePreference(storage: StorageLike | null): ColorModePreference {
  if (!storage) {
    return "system";
  }

  const storedPreference = safelyRead(storage, COLOR_MODE_STORAGE_KEY);

  if (isColorModePreference(storedPreference)) {
    return storedPreference;
  }

  const migratedPreference = migrateLegacyTheme(safelyRead(storage, LEGACY_THEME_STORAGE_KEY));
  const preference = migratedPreference ?? "system";

  safelyWrite(storage, preference);
  safelyRemove(storage);

  return preference;
}

export function readSystemColorMode(): ResolvedColorMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia(COLOR_MODE_MEDIA_QUERY).matches ? "dark" : "light";
}

export function applyAppearance(
  preference: ColorModePreference,
  systemColorMode: ResolvedColorMode,
): ResolvedColorMode {
  const resolvedColorMode = resolveColorMode(preference, systemColorMode);
  const root = document.documentElement;

  root.setAttribute("data-theme", DEFAULT_THEME_ID);
  root.setAttribute("data-color-mode", resolvedColorMode);
  root.style.colorScheme = resolvedColorMode;

  return resolvedColorMode;
}

function safelyRead(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safelyWrite(storage: StorageLike, preference: ColorModePreference): void {
  try {
    storage.setItem(COLOR_MODE_STORAGE_KEY, preference);
  } catch {
    return;
  }
}

function safelyRemove(storage: StorageLike): void {
  try {
    storage.removeItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    return;
  }
}
