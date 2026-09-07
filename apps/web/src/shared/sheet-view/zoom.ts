export const MIN_SHEET_ZOOM = 10;
export const MAX_SHEET_ZOOM = 400;
export const SHEET_ZOOM_STEP = 10;

export function normalizeSheetZoom(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(
    MIN_SHEET_ZOOM,
    Math.min(MAX_SHEET_ZOOM, Math.round(value / SHEET_ZOOM_STEP) * SHEET_ZOOM_STEP),
  );
}
