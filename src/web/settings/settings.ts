export interface Settings {
  paintBrushes: boolean;
  excelExport: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  paintBrushes: true,
  excelExport: true,
};

export const SETTINGS_STORAGE_KEY = 'bsh-settings';

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function readSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    const source =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    return {
      paintBrushes: flag(source.paintBrushes, DEFAULT_SETTINGS.paintBrushes),
      excelExport: flag(source.excelExport, DEFAULT_SETTINGS.excelExport),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
}
