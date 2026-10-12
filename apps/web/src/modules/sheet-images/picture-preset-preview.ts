import { DEFAULT_WORKBOOK_THEME, type WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import {
  normalizeDetailedPictureStyle,
  type PictureDetailedStyle,
} from "@sheetcraft/core/picture-detailed-style";
import { createDetailedPictureRaster } from "../../shared/images/picture-detailed-compositor";
import { getPictureRasterProjection } from "../../shared/images/picture-detailed-render";
const cache = new Map<string, string>();
let cacheBytes = 0;
const MAX_CACHE_BYTES = 2 * 1024 * 1024;
/** A product-owned sample, using the very same alpha, paint and projective kernels as the sheet. */
export function picturePresetPreview(
  style: PictureDetailedStyle,
  theme: WorkbookTheme = DEFAULT_WORKBOOK_THEME,
): string {
  const canonical = normalizeDetailedPictureStyle(style)!;
  const key = JSON.stringify([canonical, theme]);
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  const raster = createDetailedPictureRaster({
    widthPx: 32,
    heightPx: 24,
    pixelDensity: 2,
    style: canonical,
    theme,
    ...getPictureRasterProjection(canonical, theme),
    limits: { side: 512, pixels: 262144, memoryBytes: 16 * 1024 * 1024 },
    sourcePainter(context) {
      context.fillStyle = "#C7DEF3";
      context.fillRect(0, 0, 32, 24);
      context.fillStyle = "#3978B5";
      context.beginPath();
      context.moveTo(0, 24);
      context.lineTo(10, 9);
      context.lineTo(20, 24);
      context.closePath();
      context.fill();
      context.fillStyle = "#214F7D";
      context.beginPath();
      context.moveTo(11, 24);
      context.lineTo(24, 5);
      context.lineTo(32, 24);
      context.closePath();
      context.fill();
      context.fillStyle = "#FFF2BF";
      context.fillRect(4, 3, 5, 5);
    },
  });
  if (raster.kind !== "ready") throw Error("Preset sample has unavailable resources.");
  let data: string;
  try {
    data = raster.canvas.toDataURL("image/png");
  } finally {
    raster.canvas.width = 0;
    raster.canvas.height = 0;
  }
  if (!data.startsWith("data:image/png;base64,") || data.length > 256 * 1024)
    throw new RangeError("Preset sample exceeded its encoding budget.");
  const bytes = (key.length + data.length) * 2;
  while (cache.size >= 128 || cacheBytes + bytes > MAX_CACHE_BYTES) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cacheBytes -= (first.length + cache.get(first)!.length) * 2;
    cache.delete(first);
  }
  cache.set(key, data);
  cacheBytes += bytes;
  return data;
}
