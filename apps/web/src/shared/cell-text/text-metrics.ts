import { ref } from "vue";
import {
  createApproximateTextMeasurer,
  type AutoRowHeightFont,
  type TextMeasurer,
} from "@sheetcraft/sheet-engine/row-height";
import type { TextMeasurementMetrics } from "@sheetcraft/sheet-engine/text-layout";

const approximate = createApproximateTextMeasurer();
const measurements = new Map<string, TextMeasurementMetrics>();
let context: CanvasRenderingContext2D | null | undefined;
export const cellTextFontRevision = ref(0);

function measure(text: string, font: AutoRowHeightFont): TextMeasurementMetrics {
  const key = JSON.stringify([font, text]);
  const cached = measurements.get(key);
  if (cached) return cached;
  if (context === undefined)
    context =
      typeof document !== "undefined" && typeof CanvasRenderingContext2D !== "undefined"
        ? document.createElement("canvas").getContext("2d")
        : null;
  let metrics: TextMeasurementMetrics;
  if (context) {
    const family = font.family.includes(",") ? font.family : JSON.stringify(font.family);
    context.font = `${font.italic ? "italic " : ""}${font.weight} ${font.size}px ${family}`;
    context.textBaseline = "alphabetic";
    const measured = context.measureText(text);
    metrics = {
      width: measured.width,
      ascent: Number.isFinite(measured.actualBoundingBoxAscent)
        ? Math.max(0, measured.actualBoundingBoxAscent)
        : font.size * 0.8,
      descent: Number.isFinite(measured.actualBoundingBoxDescent)
        ? Math.max(0, measured.actualBoundingBoxDescent)
        : font.size * 0.2,
    };
  } else
    metrics = {
      width: approximate.measure(text, font),
      ascent: font.size * 0.8,
      descent: font.size * 0.2,
    };
  if (measurements.size >= 2048) measurements.clear();
  measurements.set(key, metrics);
  return metrics;
}

export const browserCellTextMeasurer: TextMeasurer = {
  measure: (text, font) => measure(text, font).width,
  measureMetrics: measure,
};

/** Invalidate after a managed font becomes ready, before rebuilding scene/row-height layout. */
export function invalidateCellTextFontMetrics(): void {
  measurements.clear();
  cellTextFontRevision.value += 1;
}
if (typeof document !== "undefined") {
  document.fonts?.addEventListener("loadingdone", invalidateCellTextFontMetrics);
  import.meta.hot?.dispose(() =>
    document.fonts?.removeEventListener("loadingdone", invalidateCellTextFontMetrics),
  );
}
