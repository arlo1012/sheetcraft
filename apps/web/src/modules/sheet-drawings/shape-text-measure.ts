import { syncShapeTextCanvasLanguage } from "./shape-text-language";
import {
  getShapeTextNativeDirection,
  shapeTextCanvasFont,
  type ShapeTextFont,
  type ShapeTextMeasurer,
  type ShapeTextMeasurementMetrics,
  type ShapeTextNormalLineMetrics,
} from "./shape-text-layout";

/** The subset permits a native-context substitute in focused, DOM-free tests. */
export type ShapeTextCanvasContext = Pick<
  CanvasRenderingContext2D,
  "font" | "textAlign" | "textBaseline" | "direction" | "measureText"
> & { canvas?: HTMLCanvasElement };
export type ShapeTextNormalMetricPolicy =
  | "font-bounding-box-sum"
  | "measured-hg-ink-box-sum"
  | "provided-native";
export type ResolvedShapeTextNormalMetrics = {
  metrics: ShapeTextNormalLineMetrics;
  policy: ShapeTextNormalMetricPolicy;
};
export class ShapeTextMeasureError extends Error {
  constructor(
    public readonly code: "canvas-unavailable" | "invalid-font" | "unavailable-metrics",
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "ShapeTextMeasureError";
  }
}

function prepare(context: ShapeTextCanvasContext, font: ShapeTextFont, text: string): void {
  if (context.canvas) syncShapeTextCanvasLanguage(context.canvas);
  if (
    !font.family ||
    !Number.isFinite(font.size) ||
    font.size <= 0 ||
    font.size > 512 ||
    ![400, 700].includes(font.weight) ||
    typeof font.italic !== "boolean"
  )
    throw new ShapeTextMeasureError(
      "invalid-font",
      "A valid resolved shape-text font is required.",
    );
  // An invalid Canvas font assignment silently retains its previous value.
  // Seed a different size so that retaining it cannot masquerade as this font.
  const sentinel = `${font.size === 1 ? 2 : 1}px monospace`;
  context.font = sentinel;
  const previous = context.font;
  context.font = shapeTextCanvasFont(font);
  if (context.font === previous)
    throw new ShapeTextMeasureError("invalid-font", "The resolved shape-text CSS font is invalid.");
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.direction = getShapeTextNativeDirection(text);
}
function nativeMeasure(
  context: ShapeTextCanvasContext,
  text: string,
  font: ShapeTextFont,
): TextMetrics {
  try {
    prepare(context, font, text);
    return context.measureText(text);
  } catch (cause) {
    if (cause instanceof ShapeTextMeasureError) throw cause;
    throw new ShapeTextMeasureError(
      "unavailable-metrics",
      "The resolved shape-text font could not be measured by the native canvas.",
      cause,
    );
  }
}
function actualMetrics(value: TextMetrics): ShapeTextMeasurementMetrics {
  const { width, actualBoundingBoxLeft, actualBoundingBoxRight } = value;
  if (
    !Number.isFinite(width) ||
    width < 0 ||
    ![
      actualBoundingBoxLeft,
      actualBoundingBoxRight,
      value.actualBoundingBoxAscent,
      value.actualBoundingBoxDescent,
    ].every(Number.isFinite) ||
    actualBoundingBoxRight < -actualBoundingBoxLeft
  )
    throw new ShapeTextMeasureError(
      "unavailable-metrics",
      "Native advance, baseline extents and signed ink bounds are required for shape text.",
    );
  return {
    width,
    // Include the baseline when a native glyph lies entirely on one side of it.
    // This is a conservative measured box, never a font-size-based estimate.
    ascent: Math.max(0, value.actualBoundingBoxAscent),
    descent: Math.max(0, value.actualBoundingBoxDescent),
    inkLeft: -actualBoundingBoxLeft,
    inkRight: actualBoundingBoxRight,
  };
}

/**
 * Real native metrics only. Neither font availability nor width/line height is
 * approximated. The font string is shared with the painter, including CSS stacks.
 * No metric cache survives a resource change, and no OS font query is performed.
 */
export function createCanvasShapeTextMeasurement(context: ShapeTextCanvasContext): {
  measurer: ShapeTextMeasurer;
  resolveNormalLineMetrics: (font: ShapeTextFont) => ResolvedShapeTextNormalMetrics;
} {
  const measure = (text: string, font: ShapeTextFont) =>
    actualMetrics(nativeMeasure(context, text, font));
  return {
    measurer: {
      measure: (text, font) => measure(text, font).width,
      measureMetrics: measure,
    },
    resolveNormalLineMetrics: (font) => {
      const value = nativeMeasure(context, "Hg", font);
      const fontAscent = value.fontBoundingBoxAscent,
        fontDescent = value.fontBoundingBoxDescent;
      if (
        [fontAscent, fontDescent].every((n) => Number.isFinite(n) && n >= 0) &&
        fontAscent + fontDescent > 0
      )
        return {
          metrics: {
            ascent: fontAscent,
            descent: fontDescent,
            lineAdvance: fontAscent + fontDescent,
          },
          policy: "font-bounding-box-sum",
        };
      const actual = actualMetrics(value);
      const lineAdvance = actual.ascent + actual.descent;
      if (lineAdvance <= 0)
        throw new ShapeTextMeasureError(
          "unavailable-metrics",
          "The ready font has no positive native normal-line extent.",
        );
      // Canvas supplies no font line-gap. On implementations without font boxes,
      // normal means the measured Hg ink box, with no fabricated em multiplier.
      return {
        metrics: { ascent: actual.ascent, descent: actual.descent, lineAdvance },
        policy: "measured-hg-ink-box-sum",
      };
    },
  };
}

let browserMeasurement: ReturnType<typeof createCanvasShapeTextMeasurement> | undefined;
export function getBrowserShapeTextMeasurement(): ReturnType<
  typeof createCanvasShapeTextMeasurement
> {
  if (browserMeasurement) return browserMeasurement;
  if (typeof document === "undefined")
    throw new ShapeTextMeasureError(
      "canvas-unavailable",
      "Native shape-text canvas is unavailable.",
    );
  let context: CanvasRenderingContext2D | null;
  try {
    context = document.createElement("canvas").getContext("2d");
  } catch (cause) {
    throw new ShapeTextMeasureError(
      "canvas-unavailable",
      "Native shape-text canvas is unavailable.",
      cause,
    );
  }
  if (!context)
    throw new ShapeTextMeasureError(
      "canvas-unavailable",
      "Native shape-text canvas is unavailable.",
    );
  browserMeasurement = createCanvasShapeTextMeasurement(context);
  return browserMeasurement;
}
