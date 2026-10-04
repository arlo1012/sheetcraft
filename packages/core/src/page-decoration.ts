/** Screen and print decorations owned by an individual worksheet. */
export type SheetWatermark = {
  text: string;
  /** Point-like visual size in canvas pixels at 100% scale. */
  fontSize: number;
  /** Optional font name for text watermarks. */
  fontFamily?: string;
  color: string;
  /** Opacity from 0 through 1. */
  opacity: number;
  /** Clockwise degrees. */
  angle: number;
  /** Optional printed image watermark. */
  image?: {
    /** Asset bytes live in the image asset store, never in snapshots. */
    assetId: string;
    /** Percentage scale; null keeps the image's automatic scale. */
    scale: number | null;
    washout: boolean;
    /** Clockwise degrees. */
    angle: number;
  };
};

export type SheetPageDecoration = {
  /** An image asset ID. Asset bytes live in the image asset store, never in snapshots. */
  backgroundAssetId?: string;
  /** Printed over every page; unlike a sheet background, it is part of print layout. */
  watermark?: SheetWatermark;
};

export const DEFAULT_SHEET_WATERMARK: SheetWatermark = {
  text: "",
  fontSize: 24,
  fontFamily: "Microsoft YaHei UI",
  color: "#c0c0c0",
  opacity: 0.5,
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
  if (text.length > 256) throw new TypeError("Watermark text is too long.");
  if (!finiteInRange(watermark.fontSize, 8, 288))
    throw new TypeError("Watermark font size is invalid.");
  if (!isColor(watermark.color)) throw new TypeError("Watermark color is invalid.");
  if (!finiteInRange(watermark.opacity, 0, 1)) throw new TypeError("Watermark opacity is invalid.");
  if (!finiteInRange(watermark.angle, -360, 360))
    throw new TypeError("Watermark angle is invalid.");
  const fontFamily = watermark.fontFamily?.trim();
  if (watermark.fontFamily !== undefined && !fontFamily)
    throw new TypeError("Watermark font family must be a non-empty string.");
  if (fontFamily && fontFamily.length > 256)
    throw new TypeError("Watermark font family is too long.");
  const image = watermark.image;
  if (image !== undefined) {
    if (!image || typeof image !== "object" || Array.isArray(image))
      throw new TypeError("Watermark image is invalid.");
    if (typeof image.assetId !== "string" || !image.assetId.trim())
      throw new TypeError("Watermark image asset ID must be a non-empty string.");
    if (image.scale !== null && !finiteInRange(image.scale, 1, 1_000))
      throw new TypeError("Watermark image scale is invalid.");
    if (typeof image.washout !== "boolean")
      throw new TypeError("Watermark image washout is invalid.");
    if (!finiteInRange(image.angle, -360, 360))
      throw new TypeError("Watermark image angle is invalid.");
  }
  if (!text && !image) return backgroundAssetId ? { backgroundAssetId } : {};
  return {
    ...(backgroundAssetId ? { backgroundAssetId } : {}),
    watermark: {
      text,
      fontSize: watermark.fontSize,
      ...(fontFamily ? { fontFamily } : {}),
      color: watermark.color,
      opacity: watermark.opacity,
      angle: watermark.angle,
      ...(image
        ? {
            image: {
              assetId: image.assetId.trim(),
              scale: image.scale,
              washout: image.washout,
              angle: image.angle,
            },
          }
        : {}),
    },
  };
}

export function cloneSheetPageDecoration(
  value: SheetPageDecoration | undefined,
): SheetPageDecoration {
  const decoration = normalizeSheetPageDecoration(value);
  return {
    ...(decoration.backgroundAssetId ? { backgroundAssetId: decoration.backgroundAssetId } : {}),
    ...(decoration.watermark
      ? {
          watermark: {
            ...decoration.watermark,
            ...(decoration.watermark.image ? { image: { ...decoration.watermark.image } } : {}),
          },
        }
      : {}),
  };
}
