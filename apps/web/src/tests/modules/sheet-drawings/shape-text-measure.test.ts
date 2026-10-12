import { describe, expect, test, vi } from "vitest";
import {
  createCanvasShapeTextMeasurement,
  ShapeTextMeasureError,
  type ShapeTextCanvasContext,
} from "../../../modules/sheet-drawings/shape-text-measure";
import type { ShapeTextFont } from "../../../modules/sheet-drawings/shape-text-layout";

const font: ShapeTextFont = { family: "Exact face", size: 20, weight: 700, italic: true };
function metrics(changes: Partial<TextMetrics> = {}): TextMetrics {
  return {
    width: 30,
    actualBoundingBoxLeft: 3,
    actualBoundingBoxRight: 32,
    actualBoundingBoxAscent: 14,
    actualBoundingBoxDescent: 4,
    fontBoundingBoxAscent: 18,
    fontBoundingBoxDescent: 6,
    ...changes,
  } as TextMetrics;
}
function context(value = metrics()): ShapeTextCanvasContext {
  return {
    font: "10px sans-serif",
    textAlign: "center",
    textBaseline: "top",
    direction: "inherit",
    measureText: vi.fn(() => value),
  };
}

describe("native shape-text measurement", () => {
  test("preserves signed actual ink overhang instead of using advance-box bounds", () => {
    const canvas = context();
    const adapter = createCanvasShapeTextMeasurement(canvas);
    expect(adapter.measurer.measureMetrics!("ab", font)).toEqual({
      width: 30,
      ascent: 14,
      descent: 4,
      inkLeft: -3,
      inkRight: 32,
    });
    expect(canvas.font).toBe('italic 700 20px "Exact face"');
    expect(canvas.textAlign).toBe("left");
    expect(canvas.textBaseline).toBe("alphabetic");
    expect(canvas.direction).toBe("ltr");
  });
  test("uses the entire exact CSS family stack and native paragraph direction", () => {
    const canvas = context();
    const family = 'Unknown system face, "Noto Sans", serif';
    createCanvasShapeTextMeasurement(canvas).measurer.measure("אב", { ...font, family });
    expect(canvas.font).toBe(`italic 700 20px ${family}`);
    expect(canvas.direction).toBe("rtl");
  });
  test("normal line metrics come from the font box, not a size-based multiplier", () => {
    const canvas = context();
    const result = createCanvasShapeTextMeasurement(canvas).resolveNormalLineMetrics(font);
    expect(result).toEqual({
      metrics: { ascent: 18, descent: 6, lineAdvance: 24 },
      policy: "font-bounding-box-sum",
    });
    expect(canvas.measureText).toHaveBeenCalledWith("Hg");
  });
  test("missing font-box support uses the declared measured-Hg policy without inferred leading", () => {
    const canvas = context(metrics({ fontBoundingBoxAscent: NaN, fontBoundingBoxDescent: NaN }));
    expect(createCanvasShapeTextMeasurement(canvas).resolveNormalLineMetrics(font)).toEqual({
      metrics: { ascent: 14, descent: 4, lineAdvance: 18 },
      policy: "measured-hg-ink-box-sum",
    });
  });
  test("baseline-clamped actual extents remain measured, including empty ink", () => {
    const canvas = context(
      metrics({
        width: 10,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: 0,
        actualBoundingBoxAscent: -2,
        actualBoundingBoxDescent: 3,
      }),
    );
    expect(createCanvasShapeTextMeasurement(canvas).measurer.measureMetrics!(" ", font)).toEqual({
      width: 10,
      ascent: 0,
      descent: 3,
      inkLeft: -0,
      inkRight: 0,
    });
  });
  test.each([
    { width: NaN },
    { width: -1 },
    { actualBoundingBoxLeft: NaN },
    { actualBoundingBoxRight: -4 },
    { actualBoundingBoxAscent: undefined },
    { actualBoundingBoxDescent: Infinity },
  ])("missing or invalid native extents fail explicitly: %j", (invalid) => {
    expect(() =>
      createCanvasShapeTextMeasurement(context(metrics(invalid))).measurer.measure("x", font),
    ).toThrow(ShapeTextMeasureError);
  });
  test("a native measurement failure retains its cause and never switches to approximation", () => {
    const canvas = context();
    const failure = new Error("native unavailable");
    canvas.measureText = () => {
      throw failure;
    };
    try {
      createCanvasShapeTextMeasurement(canvas).measurer.measure("x", font);
      throw new Error("Expected native failure.");
    } catch (error) {
      expect(error).toBeInstanceOf(ShapeTextMeasureError);
      expect(error).toMatchObject({ code: "unavailable-metrics", cause: failure });
    }
  });
  test("a silently rejected CSS font assignment fails instead of measuring the previous font", () => {
    const canvas = context();
    let saved = canvas.font;
    Object.defineProperty(canvas, "font", {
      get: () => saved,
      set: (next: string) => {
        if (next.endsWith("monospace")) saved = next;
      },
    });
    expect(() => createCanvasShapeTextMeasurement(canvas).measurer.measure("x", font)).toThrowError(
      expect.objectContaining({ code: "invalid-font" }),
    );
    expect(canvas.measureText).not.toHaveBeenCalled();
  });
  test("no measurement cache hides a later native-font change", () => {
    const canvas = context();
    const adapter = createCanvasShapeTextMeasurement(canvas);
    expect(adapter.measurer.measure("x", font)).toBe(30);
    canvas.measureText = () => metrics({ width: 40 });
    expect(adapter.measurer.measure("x", font)).toBe(40);
  });
});
