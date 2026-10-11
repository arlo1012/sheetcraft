import type { PictureColor, PicturePaintStop } from "@sheetcraft/core/picture-detailed-style";
import { resolveThemeColor, type WorkbookTheme } from "@sheetcraft/core/workbook-theme";

export type PictureRgb = readonly [number, number, number];
export type ResolvedPicturePaintStop = Readonly<{
  offset: number;
  color: PictureRgb;
  opacity: number;
}>;

/** Theme colors are resolved for each paint; stored references never become cached RGB. */
export function resolvePictureColor(
  color: PictureColor,
  theme: WorkbookTheme,
  automatic: string = "#000000",
): PictureRgb {
  const rgb =
    color.kind === "rgb"
      ? color.rgb
      : color.kind === "theme"
        ? resolveThemeColor(theme, color.reference)
        : automatic;
  if (!/^#[\da-f]{6}$/i.test(rgb)) throw new TypeError("Picture colors require six-digit RGB.");
  return [
    Number.parseInt(rgb.slice(1, 3), 16),
    Number.parseInt(rgb.slice(3, 5), 16),
    Number.parseInt(rgb.slice(5, 7), 16),
  ];
}

/** Signed brightness uses the same channel interpolation as a theme tint. */
export function brightenPictureColor(color: PictureRgb, brightness: number): PictureRgb {
  if (!Number.isFinite(brightness) || brightness < -1 || brightness > 1)
    throw new RangeError("Picture brightness must be between -1 and 1.");
  return color.map((channel) => {
    if (!Number.isFinite(channel) || channel < 0 || channel > 255)
      throw new RangeError("Picture color channels must be between 0 and 255.");
    return brightness < 0 ? channel * (1 + brightness) : channel + (255 - channel) * brightness;
  }) as unknown as PictureRgb;
}

export function resolvePicturePaintStops(
  stops: readonly PicturePaintStop[],
  theme: WorkbookTheme,
): ResolvedPicturePaintStop[] {
  return stops.map((stop) => ({
    offset: stop.offset,
    color: brightenPictureColor(resolvePictureColor(stop.color, theme), stop.brightness),
    opacity: stop.opacity,
  }));
}
