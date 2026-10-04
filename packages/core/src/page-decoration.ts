/** Screen and print decorations owned by an individual worksheet. */
export type SheetWatermark = {
  text: string;
  /** Point-like visual size in canvas pixels at 100% scale. */
  fontSize: number;
  color: string;
  /** Opacity from 0 through 1. */
  opacity: number;
  /** Clockwise degrees. */
  angle: number;
};

export type SheetPageDecoration = {
  /** An image asset ID. Asset bytes live in the image asset store, never in snapshots. */
  backgroundAssetId?: string;
  /** Printed over every page; unlike a sheet background, it is part of print layout. */
  watermark?: SheetWatermark;
};

export const DEFAULT_SHEET_WATERMARK: SheetWatermark = {
  text: "",
  fontSize: 48,
  color: "#808080",
  opacity: 0.25,
  angle: -45,
};

function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function finiteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

export function normalizeSheetPageDecoration(value: unknown): SheetPageDecoration {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Page decoration must be an object.");
  const decoration = value as SheetPageDecoration;
  const backgroundAssetId = decoration.backgroundAssetId?.trim();
  if (decoration.backgroundAssetId !== undefined && !backgroundAssetId)
    throw new TypeError("Background asset ID must be a non-empty string.");
  if (!decoration.watermark) return backgroundAssetId ? { backgroundAssetId } : {};
  const watermark = decoration.watermark;
  const text = typeof watermark.text === "string" ? watermark.text.trim() : "";
  if (!text) return backgroundAssetId ? { backgroundAssetId } : {};
  if (text.length > 256) throw new TypeError("Watermark text is too long.");
  if (!finiteInRange(watermark.fontSize, 8, 288))
    throw new TypeError("Watermark font size is invalid.");
  if (!isColor(watermark.color)) throw new TypeError("Watermark color is invalid.");
  if (!finiteInRange(watermark.opacity, 0, 1)) throw new TypeError("Watermark opacity is invalid.");
  if (!finiteInRange(watermark.angle, -360, 360))
    throw new TypeError("Watermark angle is invalid.");
  return {
    ...(backgroundAssetId ? { backgroundAssetId } : {}),
    watermark: {
      text,
      fontSize: watermark.fontSize,
      color: watermark.color,
      opacity: watermark.opacity,
      angle: watermark.angle,
    },
  };
}

export function cloneSheetPageDecoration(
  value: SheetPageDecoration | undefined,
): SheetPageDecoration {
  const decoration = normalizeSheetPageDecoration(value);
  return {
    ...(decoration.backgroundAssetId ? { backgroundAssetId: decoration.backgroundAssetId } : {}),
    ...(decoration.watermark ? { watermark: { ...decoration.watermark } } : {}),
  };
}
