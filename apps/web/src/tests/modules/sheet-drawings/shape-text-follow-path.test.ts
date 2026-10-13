import { describe, expect, test, vi } from "vitest";
import { sampleTextWarpBoundary, type TextWarpPathCommand } from "@sheetcraft/core/text-warps";
import {
  layoutShapeText,
  type ShapeTextFont,
  type ShapeTextLayoutInput,
  type ShapeTextMeasurementMetrics,
  type ShapeTextNormalLineMetrics,
} from "../../../modules/sheet-drawings/shape-text-layout";
import {
  prepareShapeTextFollowPath,
  SHAPE_TEXT_FOLLOW_PATH_GLYPH_POLICY,
  SHAPE_TEXT_FOLLOW_PATH_LIMITS,
  ShapeTextFollowPathError,
  type ShapeTextFollowPathInput,
} from "../../../modules/sheet-drawings/shape-text-follow-path";

const font: ShapeTextFont = { family: "Native test face", size: 20, weight: 400, italic: false };
type MutableInput = {
  -readonly [Key in keyof ShapeTextFollowPathInput]: ShapeTextFollowPathInput[Key];
};
const normal = (value: ShapeTextFont): ShapeTextNormalLineMetrics => ({
  ascent: value.size * 0.75,
  descent: value.size * 0.25,
  lineAdvance: value.size * 1.25,
});
function native(value: string, face: ShapeTextFont): ShapeTextMeasurementMetrics {
  return {
    width: (value.length * face.size) / 2,
    ascent: value.trim() ? face.size * 0.65 : 0,
    descent: value.trim() ? face.size * 0.2 : 0,
    inkLeft: value.trim() ? -2 : 0,
    inkRight: value.trim() ? (value.length * face.size) / 2 + 3 : 0,
  };
}
function track(
  commands: readonly TextWarpPathCommand[] = [
    ["M", 0, 0],
    ["L", 120, 0],
  ],
) {
  return sampleTextWarpBoundary(commands, { width: 500, height: 500, positionTolerance: 0.01 });
}
function fixture(
  text = "AB",
  overrides: Partial<ShapeTextLayoutInput> = {},
  metrics = vi.fn(native),
): MutableInput & { metrics: typeof metrics } {
  const measurer = {
    measure: (value: string, face: ShapeTextFont) => metrics(value, face).width,
    measureMetrics: metrics,
  };
  const source: ShapeTextLayoutInput = {
    text,
    textRect: { x: 30, y: 40, width: 500, height: 500 },
    font,
    normalLineMetrics: normal(font),
    resolveNormalLineMetrics: normal,
    measurer,
    layout: {
      direction: "horizontal",
      blockAlignment: "start",
      lineOrder: "rtl",
      marginsPt: { leftPt: 0, rightPt: 0, topPt: 0, bottomPt: 0 },
      wrap: false,
      overflow: true,
      autoFit: "none",
      keepFlat: false,
    },
    paragraph: { alignment: "left", beforePt: 0, afterPt: 0, lineSpacing: { kind: "normal" } },
    ...overrides,
  };
  const layout = layoutShapeText(source);
  metrics.mockClear();
  return {
    sourceText: text,
    layout,
    font: source.font,
    normalLineMetrics: source.normalLineMetrics,
    resolveNormalLineMetrics: source.resolveNormalLineMetrics,
    measurer,
    tracks: [track()],
    groups: [
      {
        lineIndices: layout.lines.map((_, index) => index),
        trackIndex: 0,
        nativeBaselineY: layout.runs[0]?.y ?? 40,
      },
    ],
    metrics,
  };
}
function failure(input: ShapeTextFollowPathInput, code: ShapeTextFollowPathError["code"]) {
  try {
    prepareShapeTextFollowPath(input);
  } catch (error) {
    expect(error).toBeInstanceOf(ShapeTextFollowPathError);
    expect((error as ShapeTextFollowPathError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}.`);
}

describe("native independent ASCII rigid follow-path glyph placement", () => {
  test("declares nonligature/nonkerning typography and measures exact independent glyphs", () => {
    const metrics = vi.fn((text: string, face: ShapeTextFont) => ({
      ...native(text, face),
      width: text === "fi" ? 9 : text === "f" ? 8 : text === "i" ? 4 : text.length * 10,
    }));
    const input = fixture("fi", {}, metrics);
    expect(input.layout.runs[0]!.advancePx).toBe(9);
    const result = prepareShapeTextFollowPath(input);
    expect(result.policy).toBe(SHAPE_TEXT_FOLLOW_PATH_GLYPH_POLICY);
    expect(metrics.mock.calls.map(([text]) => text)).toEqual(["f", "i"]);
    expect(result.placements.map((value) => value.nativeAdvancePx)).toEqual([8, 4]);
    expect(result.placements.map((value) => value.trackFraction)).toEqual([1 / 3, 5 / 6]);
    expect(result.placements.map((value) => value.x)).toEqual([36, 98]);
    expect(result.measurementCount).toBe(2);
    expect(result.totalMeasurementCount).toBe(input.layout.measurementCount + 2);
    expect(result.work).toMatchObject({
      glyphs: 2,
      trackLookups: 2,
      normalMetricResolutions: 0,
      sourceUnits: 2,
    });
    expect(result.numericBytes).toBeGreaterThan(input.tracks[0]!.work.numericBytes);
    expect(result.work.workUnits).toBeLessThan(SHAPE_TEXT_FOLLOW_PATH_LIMITS.workUnits);
  });

  test("authored spaces retain ordered advance placements and remain truly transparent", () => {
    const input = fixture(" A B ");
    const result = prepareShapeTextFollowPath(input);
    expect(result.placements.map((value) => value.text).join("")).toBe(" A B ");
    expect(result.placements.map((value) => [value.sourceStart, value.sourceEnd])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]);
    expect(result.placements.map((value) => value.baselineCenter.x)).toEqual([12, 36, 60, 84, 108]);
    expect(
      result.placements
        .filter((value) => value.text === " ")
        .every((value) => value.inkBounds === null),
    ).toBe(true);
    expect(
      result.placements
        .filter((value) => value.text !== " ")
        .every((value) => value.inkBounds !== null),
    ).toBe(true);
    expect(result.inkBounds).toEqual({ x: 29, y: -13, width: 63, height: 17 });
    expect(input.layout.runs[0]!.text).toBe(" A B ");
  });

  test.each(["", "   ", "\n\r\n"])(
    "blank source %j never creates a sentinel glyph or ink",
    (text) => {
      const result = prepareShapeTextFollowPath(fixture(text));
      expect(result.inkBounds).toBeNull();
      expect(result.placements.map((value) => value.text).join("")).toBe(
        text.replace(/\r\n?|\n/gu, ""),
      );
      expect(result.placements.every((value) => value.inkBounds === null)).toBe(true);
    },
  );

  test("keeps exact font size, source run identity and original CRLF offsets", () => {
    const large = {
      ...font,
      family: "Other native face",
      size: 40,
      weight: 700 as const,
      italic: true,
    };
    const input = fixture("A\r\nBC", {
      characterSegments: [
        { start: 0, end: 3, font, underline: true, strike: false, color: "#123456" },
        { start: 3, end: 5, font: large, underline: false, strike: true, fill: { kind: "none" } },
      ],
    });
    const result = prepareShapeTextFollowPath(input);
    expect(result.placements.map((value) => value.text)).toEqual(["A", "B", "C"]);
    expect(result.placements.map((value) => value.sourceRunIndex)).toEqual([0, 1, 1]);
    expect(result.placements.map((value) => value.sourceStart)).toEqual([0, 3, 4]);
    expect(result.placements.map((value) => value.font.size)).toEqual([20, 40, 40]);
    expect(input.metrics.mock.calls.map(([, value]) => value.size)).toEqual([20, 40, 40]);
    expect(result.placements[1]!.font).toEqual(large);
    expect(result.placements[1]!.ascentPx).toBe(30);
    expect(result.work.normalMetricResolutions).toBe(1);
    expect(result.totalMeasurementCount).toBe(input.layout.measurementCount + 4);
    expect(input.layout.runs[result.placements[0]!.sourceRunIndex]!.underline).toBe(true);
    expect(input.layout.runs[result.placements[1]!.sourceRunIndex]!.fill).toEqual({ kind: "none" });
  });

  test("re-advances adjacent attributed runs independently instead of prefix-width guesses", () => {
    const input = fixture("AV", {
      characterSegments: [
        { start: 0, end: 1, font, underline: false, strike: false },
        { start: 1, end: 2, font, underline: true, strike: false },
      ],
    });
    const result = prepareShapeTextFollowPath(input);
    expect(input.metrics.mock.calls.map(([text]) => text)).toEqual(["A", "V"]);
    expect(result.placements.map((value) => value.sourceRunIndex)).toEqual([0, 1]);
    expect(result.placements.map((value) => value.x)).toEqual([25, 85]);
  });

  test("rigidly rotates native ink and preserves off-track normal distance without font scaling", () => {
    const input = fixture("A");
    input.tracks = [
      track([
        ["M", 10, 20],
        ["L", 10, 140],
      ]),
    ];
    input.groups = [
      { lineIndices: [0], trackIndex: 0, nativeBaselineY: input.layout.runs[0]!.y - 7 },
    ];
    input.origin = { x: 100, y: 200 };
    const value = prepareShapeTextFollowPath(input).placements[0]!;
    expect(value).toMatchObject({
      angle: 90,
      x: 103,
      y: 275,
      baselineCenter: { x: 103, y: 280 },
      tangent: { x: 0, y: 1 },
    });
    expect(value.inkBounds).toEqual({ x: 99, y: 273, width: 17, height: 15 });
    expect(value.font.size).toBe(20);
    expect(value.nativeAdvancePx).toBe(10);
  });

  test("negative full-circle direction comes exclusively from the native signed sampler", () => {
    const input = fixture("AB");
    input.tracks = [
      track([
        ["M", 100, 50],
        ["A", 50, 50, 50, 50, 0, -2 * Math.PI],
      ]),
    ];
    const [first, second] = prepareShapeTextFollowPath(input).placements;
    expect(first!.baselineCenter.x).toBeCloseTo(50, 6);
    expect(first!.baselineCenter.y).toBeCloseTo(0, 6);
    expect(first!.tangent.x).toBeCloseTo(-1, 8);
    expect(Math.abs(first!.angle)).toBeCloseTo(180, 8);
    expect(second!.baselineCenter.x).toBeCloseTo(50, 6);
    expect(second!.baselineCenter.y).toBeCloseTo(100, 6);
    expect(second!.tangent.x).toBeCloseTo(1, 8);
    expect(second!.text).toBe("B");
  });

  test("caller explicitly groups complete source lines, including blank lines, and owns baseline choice", () => {
    const input = fixture("A\n\nB\nC");
    input.tracks = [
      track(),
      track([
        ["M", 0, 100],
        ["L", 120, 100],
      ]),
    ];
    input.groups = [
      { lineIndices: [2, 3], trackIndex: 1, nativeBaselineY: input.layout.runs[1]!.y },
      { lineIndices: [0, 1], trackIndex: 0, nativeBaselineY: input.layout.runs[0]!.y },
    ];
    const result = prepareShapeTextFollowPath(input);
    expect(result.placements.map((value) => value.text)).toEqual(["A", "B", "C"]);
    expect(result.placements.map((value) => value.trackIndex)).toEqual([0, 1, 1]);
    expect(result.placements.map((value) => value.y)).toEqual([0, 100, 125]);
    expect(result.placements.map((value) => value.sourceLineIndex)).toEqual([0, 2, 3]);
    expect(result.placements.map((value) => value.sourceStart)).toEqual([0, 3, 5]);
  });

  test("all track groups share one independent source domain, so short lines remain shorter", () => {
    const input = fixture("A\nBCD\n E ");
    input.tracks = [
      track(),
      track([
        ["M", 0, 100],
        ["L", 120, 100],
      ]),
      track([
        ["M", 0, 200],
        ["L", 120, 200],
      ]),
    ];
    input.groups = input.layout.lines.map((line, index) => ({
      lineIndices: [index],
      trackIndex: index,
      nativeBaselineY: line.runs[0]!.y,
    }));
    const result = prepareShapeTextFollowPath(input);
    expect(result.sourceInlineLeft).toBe(30);
    expect(result.sourceInlineRight).toBe(60);
    expect(
      result.placements
        .filter((value) => value.sourceLineIndex === 0)
        .map((value) => value.baselineCenter.x),
    ).toEqual([20]);
    expect(
      result.placements
        .filter((value) => value.sourceLineIndex === 1)
        .map((value) => value.baselineCenter.x),
    ).toEqual([20, 60, 100]);
    expect(
      result.placements
        .filter((value) => value.sourceLineIndex === 2)
        .map((value) => value.baselineCenter.x),
    ).toEqual([20, 60, 100]);
    expect(result.placements.map((value) => value.text).join("")).toBe("ABCD E ");
    expect(input.metrics.mock.calls.map(([text]) => text)).toEqual([
      "A",
      "B",
      "C",
      "D",
      " ",
      "E",
      " ",
    ]);
  });

  test("rejects repeated, omitted, stale or reordered run/line/group ownership", () => {
    const stale = fixture();
    stale.sourceText = "AC";
    failure(stale, "stale-source");
    const clonedRun = fixture();
    clonedRun.layout.lines[0]!.runs = [{ ...clonedRun.layout.runs[0]! }];
    failure(clonedRun, "stale-source");
    const repeated = fixture("A\nB");
    repeated.layout.lines[1]!.runs = [repeated.layout.runs[0]!];
    failure(repeated, "stale-source");
    const missingRun = fixture();
    missingRun.layout.lines[0]!.runs = [];
    failure(missingRun, "stale-source");
    const range = fixture();
    range.layout.runs[0]!.sourceEnd = 1;
    failure(range, "stale-source");
    for (const indices of [[1, 0], [0, 0], [0], [0, 2]]) {
      const input = fixture("A\nB");
      input.groups = [{ lineIndices: indices, trackIndex: 0, nativeBaselineY: 0 }];
      failure(input, "invalid-group-ownership");
    }
    const repeatedGroups = fixture("A\nB");
    repeatedGroups.groups = [
      { lineIndices: [0], trackIndex: 0, nativeBaselineY: 0 },
      { lineIndices: [0, 1], trackIndex: 0, nativeBaselineY: 0 },
    ];
    failure(repeatedGroups, "invalid-group-ownership");
  });

  test.each(["é", "A\u0301", "😀", "A\tB", "\u007f", "汉字"])(
    "explicitly rejects unsupported %j",
    (text) => {
      const input = fixture(text);
      failure(input, "unsupported-text");
      expect(input.metrics).not.toHaveBeenCalled();
    },
  );

  test.each([90, 180, 270] as const)(
    "does not silently flatten native source angle %s",
    (angle) => {
      const input = fixture();
      input.layout.runs[0]!.angle = angle;
      failure(input, "unsupported-source-angle");
    },
  );

  test("rejects upright vertical fallback even if its native source angle happens to be zero", () => {
    const input = fixture();
    input.layout.runs[0]!.verticalOrientation = "U";
    failure(input, "unsupported-source-angle");
  });

  test("constant and interior-cusp tracks fail explicitly rather than making fake alpha", () => {
    const constant = fixture("A");
    constant.tracks = [
      track([
        ["M", 0, 0],
        ["L", 0, 0],
      ]),
    ];
    failure(constant, "singular-tangent");
    const cusp = fixture("A");
    cusp.tracks = [
      track([
        ["M", 0, 0],
        ["Q", 100, 0, 0, 0],
      ]),
    ];
    failure(cusp, "singular-tangent");
    const blank = fixture("");
    blank.tracks = constant.tracks;
    expect(prepareShapeTextFollowPath(blank).placements).toEqual([]);
  });

  test("rejects absent signed/native metrics and unsupported normal/font tuples", () => {
    const noMetrics = fixture();
    noMetrics.measurer = { measure: () => 10 };
    failure(noMetrics, "unavailable-metrics");
    const signed = fixture();
    signed.measurer = {
      measure: () => 10,
      measureMetrics: () => ({ width: 10, ascent: 15, descent: 5 }),
    };
    failure(signed, "unavailable-metrics");
    const invalid = fixture();
    invalid.measurer = {
      measure: () => 10,
      measureMetrics: () => ({ width: 10, ascent: 15, descent: 5, inkLeft: 10, inkRight: 0 }),
    };
    failure(invalid, "unavailable-metrics");
    const staleNormal = fixture();
    staleNormal.normalLineMetrics = { ...normal(font), ascent: 14 };
    failure(staleNormal, "stale-source");
    const invalidFont = fixture();
    invalidFont.layout.runs[0]!.font = { ...font, size: Infinity };
    failure(invalidFont, "unavailable-metrics");
    const invalidNormal = fixture();
    invalidNormal.normalLineMetrics = { ascent: 0, descent: 0, lineAdvance: 0 };
    failure(invalidNormal, "unavailable-metrics");
    const zero = fixture();
    zero.measurer = {
      measure: () => 0,
      measureMetrics: () => ({ ...native("A", font), width: 0 }),
    };
    failure(zero, "unavailable-metrics");
  });

  test("enforces total measurement, glyph/source, coordinate and shared numeric budgets", () => {
    const exhausted = fixture();
    exhausted.maxMeasurements = exhausted.layout.measurementCount + 1;
    failure(exhausted, "placement-budget");
    expect(exhausted.metrics).toHaveBeenCalledTimes(1);
    const exact = fixture();
    exact.maxMeasurements = exact.layout.measurementCount + 2;
    expect(prepareShapeTextFollowPath(exact).totalMeasurementCount).toBe(exact.maxMeasurements);
    const huge = fixture();
    huge.sourceText = " ".repeat(SHAPE_TEXT_FOLLOW_PATH_LIMITS.sourceUnits + 1);
    failure(huge, "placement-budget");
    const glyphs = fixture(
      "A".repeat(SHAPE_TEXT_FOLLOW_PATH_LIMITS.glyphs + 1),
      {},
      vi.fn((text: string) => ({
        width: text.length,
        ascent: 13,
        descent: 4,
        inkLeft: 0,
        inkRight: text.length,
      })),
    );
    failure(glyphs, "placement-budget");
    expect(glyphs.metrics).toHaveBeenCalledTimes(SHAPE_TEXT_FOLLOW_PATH_LIMITS.glyphs);
    const coordinate = fixture();
    coordinate.origin = { x: Infinity, y: 0 };
    failure(coordinate, "placement-budget");
    const wide = fixture();
    wide.layout.contentRect.width = SHAPE_TEXT_FOLLOW_PATH_LIMITS.extent + 1;
    failure(wide, "placement-budget");
    const fakeTrack = fixture();
    fakeTrack.tracks = [{ ...fakeTrack.tracks[0]! }];
    failure(fakeTrack, "invalid-input");
  });
});
