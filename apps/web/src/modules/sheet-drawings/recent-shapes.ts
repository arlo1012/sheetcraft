import { readonly, ref } from "vue";

const STORAGE_KEY = "sheetcraft.recent-shapes";
const MAX_RECENT_SHAPES = 12;

function loadRecentShapes(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && item.length > 0)
      .slice(0, MAX_RECENT_SHAPES);
  } catch {
    return [];
  }
}

function saveRecentShapes(ids: readonly string[]): void {
  try {
    if (ids.length) globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ids));
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* Ignore storage unavailability or quota failures. */
  }
}

const recentShapeIds = ref<string[]>(loadRecentShapes());

export function recordRecentShape(id: string): void {
  if (!id) return;
  const next = [id, ...recentShapeIds.value.filter((item) => item !== id)].slice(
    0,
    MAX_RECENT_SHAPES,
  );
  recentShapeIds.value = next;
  saveRecentShapes(next);
}

export function clearRecentShapes(): void {
  recentShapeIds.value = [];
  saveRecentShapes([]);
}

export function useRecentShapes() {
  return {
    recentShapeIds: readonly(recentShapeIds),
    recordRecentShape,
    clearRecentShapes,
  };
}
