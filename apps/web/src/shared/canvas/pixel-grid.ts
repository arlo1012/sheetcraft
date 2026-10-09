import type { Rect } from "@sheetcraft/sheet-engine/geometry";

/** Pixel alignment for the axis-aligned transforms used by Sheet canvases. */
export function createCanvasPixelGrid(context: CanvasRenderingContext2D, screenScale = 1) {
  const { a, d, e, f } = context.getTransform();
  const densityX = Math.abs(a);
  const densityY = Math.abs(d);
  const snapX = (edge: number) => (Math.round(edge * a + e) - e) / a;
  const snapY = (edge: number) => (Math.round(edge * d + f) - f) / d;
  // Document strokes retain their logical weight; all strokes occupy whole
  // backing pixels, with a one-pixel minimum for hairlines at low zoom.
  const strokeWidth = (logicalWidth: number) =>
    Math.max(1, Math.round(logicalWidth * densityX)) / densityX;
  const screenStrokeWidth = (cssWidth: number) => strokeWidth(cssWidth / screenScale);
  return {
    densityX,
    densityY,
    strokeWidth,
    screenStrokeWidth,
    snapX,
    snapY,
    strokeX: (center: number, width: number) => snapX(center - width / 2) + width / 2,
    strokeY: (center: number, width: number) => snapY(center - width / 2) + width / 2,
    snapRect: (rect: Rect): Rect => {
      const x = snapX(rect.x);
      const y = snapY(rect.y);
      return {
        x,
        y,
        width: Math.max(0, snapX(rect.x + rect.width) - x),
        height: Math.max(0, snapY(rect.y + rect.height) - y),
      };
    },
  };
}
