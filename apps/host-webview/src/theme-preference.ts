export type CanvasTheme = 'light' | 'dark';
export type ThemePreference = CanvasTheme | null;

export const THEME_PREFERENCE_KEY = 'dbml-canvas/theme-preference';

interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function resolveCanvasTheme(
  hostTheme: CanvasTheme,
  preference: ThemePreference,
): CanvasTheme {
  return preference ?? hostTheme;
}

export function toggleCanvasTheme(theme: CanvasTheme): CanvasTheme {
  return theme === 'dark' ? 'light' : 'dark';
}

export function readThemePreference(storage?: ThemeStorage): ThemePreference {
  if (!storage) return null;
  try {
    const value = storage.getItem(THEME_PREFERENCE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function writeThemePreference(storage: ThemeStorage | undefined, theme: CanvasTheme): void {
  if (!storage) return;
  try {
    storage.setItem(THEME_PREFERENCE_KEY, theme);
  } catch {
    // Some embedded browser origins disable local storage; the in-memory preference still works.
  }
}
