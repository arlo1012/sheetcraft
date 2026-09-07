export const RECENT_COLORS_STORAGE_KEY = "idea10.recent-colors.v1";

export const PRESET_COLORS = [
  "#ffffff",
  "#000000",
  "#44546a",
  "#4472c4",
  "#00b0f0",
  "#259b67",
  "#ed4337",
  "#ff802d",
  "#ffc000",
  "#a12fd4",
  "#f2f2f2",
  "#d9d9d9",
  "#d9e2f3",
  "#dae3f3",
  "#cceeff",
  "#d3eee1",
  "#fbd8d6",
  "#ffe1cf",
  "#fff2cc",
  "#f2d5fb",
  "#d9d9d9",
  "#bfbfbf",
  "#b4c7e7",
  "#b4c7e7",
  "#99ddf9",
  "#a8d9c0",
  "#f6aca7",
  "#ffc19c",
  "#ffe699",
  "#dfa9ef",
  "#bfbfbf",
  "#7f7f7f",
  "#8faadc",
  "#8eaadb",
  "#66ccf5",
  "#7dcc9d",
  "#f17a72",
  "#ffa366",
  "#ffd966",
  "#ce7ce7",
  "#a6a6a6",
  "#404040",
  "#5b9bd5",
  "#5b9bd5",
  "#33bbee",
  "#52b879",
  "#ed4337",
  "#ff802d",
  "#ffc000",
  "#b44bd1",
  "#7f7f7f",
  "#000000",
  "#2f5597",
  "#2f5597",
  "#0070c0",
  "#1f7a52",
  "#c00000",
  "#c55a11",
  "#bf9000",
  "#7030a0",
] as const;

export const STANDARD_COLORS = [
  "#c00000",
  "#ff0000",
  "#ffc000",
  "#ffff00",
  "#92d050",
  "#00b050",
  "#00b0f0",
  "#0070c0",
  "#002060",
  "#7030a0",
] as const;

export function normalizeColor(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  const normalized = color.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : undefined;
}

function getStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

let memoryRecentColors: string[] | undefined;
let failedStorage: Storage | undefined;

export function readRecentColors(storage: Storage | undefined = getStorage()): string[] {
  if (!storage || storage === failedStorage) return memoryRecentColors ?? [];
  try {
    const value = storage?.getItem(RECENT_COLORS_STORAGE_KEY);
    if (!value) {
      memoryRecentColors = [];
      return [];
    }
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      memoryRecentColors = [];
      return [];
    }
    const recent = [
      ...new Set(
        parsed
          .map((color) => (typeof color === "string" ? normalizeColor(color) : undefined))
          .filter((color): color is string => Boolean(color)),
      ),
    ].slice(0, 10);
    memoryRecentColors = recent;
    return recent;
  } catch {
    return memoryRecentColors ?? [];
  }
}

export function recordRecentColor(
  color: string,
  storage: Storage | undefined = getStorage(),
): string[] {
  const normalized = normalizeColor(color);
  if (!normalized) return readRecentColors(storage);
  const recent = [
    normalized,
    ...readRecentColors(storage).filter((value) => value !== normalized),
  ].slice(0, 10);
  memoryRecentColors = recent;
  try {
    storage?.setItem(RECENT_COLORS_STORAGE_KEY, JSON.stringify(recent));
    failedStorage = undefined;
  } catch {
    failedStorage = storage;
    // Color selection must still work in restricted storage contexts.
  }
  return recent;
}
