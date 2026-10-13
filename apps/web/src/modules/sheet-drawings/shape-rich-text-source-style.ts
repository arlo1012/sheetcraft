import type { CSSProperties } from "vue";
import type { ShapePaint } from "@sheetcraft/core/shape-style";
import type { ShapeTextCharacterFormat } from "@sheetcraft/core/shape-text-character-runs";
import { DEFAULT_WORKBOOK_THEME, type WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import {
  resolvePictureColor,
  resolvePicturePaintStops,
  type PictureRgb,
} from "../../shared/images/picture-paint-color";

function rgba(color: PictureRgb, opacity: number): string {
  return `rgba(${color.map(Math.round).join(", ")}, ${opacity})`;
}
function sourcePaintColor(paint: ShapePaint, theme: WorkbookTheme): string {
  if (paint.kind === "solid") return rgba(resolvePictureColor(paint.color, theme), paint.opacity);
  if (paint.kind === "pattern")
    return rgba(resolvePictureColor(paint.foreground, theme), paint.opacity);
  if (paint.kind === "picture") return rgba([0, 0, 0], paint.opacity);
  const stop = resolvePicturePaintStops(paint.stops, theme)[0]!;
  return rgba(stop.color, stop.opacity * paint.opacity);
}
function sourceGradient(paint: ShapePaint, theme: WorkbookTheme): string | undefined {
  if (paint.kind !== "linear" && paint.kind !== "radial") return;
  const stops = resolvePicturePaintStops(paint.stops, theme)
    .map((stop) => `${rgba(stop.color, stop.opacity * paint.opacity)} ${stop.offset * 100}%`)
    .join(", ");
  if (paint.kind === "linear") return `linear-gradient(${90 + paint.angleDeg}deg, ${stops})`;
  return `radial-gradient(ellipse ${paint.radiusX * 100}% ${paint.radiusY * 100}% at ${paint.centerX * 100}% ${paint.centerY * 100}%, ${stops})`;
}

/**
 * A safe source-only DOM projection. It never reads markup or adds another text
 * model. Non-solid fills use span-local previews, rather than the native painter's
 * shared shape coordinates; detailed outlines also retain their final paint data.
 */
export function shapeRichTextSourceStyle(
  format: ShapeTextCharacterFormat,
  theme: WorkbookTheme = DEFAULT_WORKBOOK_THEME,
  scale = 1,
): { style: CSSProperties; previewDiffers: boolean } {
  if (!Number.isFinite(scale) || scale <= 0)
    throw new RangeError("Shape text source scale must be finite and positive.");
  const style: CSSProperties = {
    color: format.color ?? "#000000",
    WebkitTextFillColor: "currentColor",
    WebkitTextStrokeWidth: "0px",
    WebkitTextStrokeColor: "transparent",
    paintOrder: "stroke fill",
  };
  let previewDiffers = false;
  // Core excludes fallback-only color when an explicit local fill is present.
  // An authored local color remains the strongest direct solid override.
  if (format.color === undefined && format.fill) {
    if (format.fill.kind === "none") style.WebkitTextFillColor = "transparent";
    else {
      const paint = format.fill.value;
      style.color = sourcePaintColor(paint, theme);
      previewDiffers = paint.kind !== "solid";
      const gradient = sourceGradient(paint, theme);
      if (gradient) {
        style.backgroundImage = gradient;
        style.backgroundClip = "text";
        style.WebkitBackgroundClip = "text";
        style.WebkitTextFillColor = "transparent";
      }
    }
  }
  if (format.line?.kind === "value") {
    const line = format.line.value;
    style.WebkitTextStrokeWidth = `${(line.widthPt * 4 * scale) / 3}px`;
    style.WebkitTextStrokeColor = sourcePaintColor(line.paint, theme);
    previewDiffers ||=
      line.paint.kind !== "solid" || line.compound !== "single" || line.dash !== "solid";
  }
  previewDiffers ||=
    format.shadow?.kind === "value" ||
    format.reflection?.kind === "value" ||
    format.glow?.kind === "value";
  return { style, previewDiffers };
}
