import { describe, expect, test } from "vitest";
import {
  layoutShapeText,
  type ShapeTextLayoutInput,
} from "../../../modules/sheet-drawings/shape-text-layout";
import { getShapeTextWarpNativeSource } from "../../../modules/sheet-drawings/shape-text-warp-source";

function layout(text = "  ink  ", overrides: Partial<ShapeTextLayoutInput> = {}) {
  return layoutShapeText({
    text,
    textRect: { x: 30, y: 40, width: 200, height: 120 },
    font: { family: "Test", size: 20, weight: 400, italic: false },
    normalLineMetrics: { ascent: 15, descent: 5, lineAdvance: 25 },
    measurer: {
      measure: (value) => value.length * 10,
      measureMetrics: (value) => ({
        width: value.length * 10,
        ascent: /\S/u.test(value) ? 13 : 0,
        descent: /\S/u.test(value) ? 4 : 0,
        inkLeft: value.search(/\S/u) >= 0 ? value.search(/\S/u) * 10 - 2 : 0,
        inkRight: /\S/u.test(value) ? value.trimEnd().length * 10 + 3 : 0,
      }),
    },
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
  });
}

describe("unpainted native text-warp source geometry", () => {
  test("authored leading/trailing advances and native ink use separate extents", () => {
    const source = getShapeTextWarpNativeSource(layout());
    expect(source).toMatchObject({ kind: "native-text", left: 30, width: 70, height: 17 });
    if (source.kind !== "native-text") throw new Error("Expected native source.");
    expect(source.top).toBe(source.baselineY - 13);
  });

  test("does not normalize from visible paint, clipped ink, content rect or styles", () => {
    const value = layout("  ink  ");
    const expected = getShapeTextWarpNativeSource(value);
    value.visibleInkBounds = null;
    value.inkBounds = { x: 1000, y: 1000, width: 2, height: 2 };
    value.contentRect = { x: 0, y: 0, width: 1, height: 1 };
    value.clipRect = { x: 0, y: 0, width: 1, height: 1 };
    value.overflow = false;
    value.runs[0]!.color = "transparent";
    value.runs[0]!.fill = { kind: "none" };
    expect(getShapeTextWarpNativeSource(value)).toEqual(expected);
  });

  test.each(["", "   ", "\n \t\n"])("%j has no manufactured glyph rectangle", (text) => {
    expect(getShapeTextWarpNativeSource(layout(text)).kind).toBe("whitespace");
  });

  test("groups complete lines explicitly without assigning, repeating or rewriting text", () => {
    const value = layout("first\nsecond\nthird");
    const source = getShapeTextWarpNativeSource(value, [1, 2]);
    expect(source.runIndices.map((index) => value.runs[index]!.text)).toEqual(["second", "third"]);
    expect(source.runIndices).toEqual([1, 2]);
    expect(value.lines.map((line) => line.text)).toEqual(["first", "second", "third"]);
    expect(() => getShapeTextWarpNativeSource(value, [1, 1])).toThrow(/ordered/);
    expect(() => getShapeTextWarpNativeSource(value, [2, 1])).toThrow(/ordered/);
    expect(() => getShapeTextWarpNativeSource(value, [-1])).toThrow(/ordered/);
    expect(() => getShapeTextWarpNativeSource(value, [3])).toThrow(/ordered/);
  });

  test("authored blank paragraphs preserve advance spacing", () => {
    const plain = getShapeTextWarpNativeSource(layout("ink"));
    const blank = getShapeTextWarpNativeSource(layout("\nink\n"));
    if (plain.kind !== "native-text" || blank.kind !== "native-text")
      throw new Error("Expected ink.");
    expect(blank.top).toBe(40);
    expect(blank.height).toBeGreaterThan(plain.height + 40);
  });

  test("native overhang retains extents outside advances", () => {
    const value = layout("ink");
    value.runs[0]!.inkBounds = { x: 25, y: 40, width: 45, height: 17 };
    expect(getShapeTextWarpNativeSource(value)).toMatchObject({ left: 25, width: 45 });
  });

  test("90/270 native source advances are directed and finite", () => {
    for (const angle of [90, 270] as const) {
      const value = layout("ink");
      const run = value.runs[0]!;
      run.angle = angle;
      run.x = 50;
      run.y = 100;
      run.inlineAdvancePx = 30;
      run.inkBounds = { x: 40, y: 90, width: 17, height: 20 };
      const source = getShapeTextWarpNativeSource(value);
      expect(source).toMatchObject({ kind: "native-text", left: 40, width: 17 });
      if (source.kind !== "native-text") throw new Error("Expected ink.");
      expect(source.top).toBe(angle === 90 ? 90 : 70);
      expect(source.height).toBe(angle === 90 ? 40 : 40);
    }
  });

  test("rejects stale, repeated and invalid numeric run ownership", () => {
    const stale = layout();
    stale.lines[0]!.runs = [{ ...stale.runs[0]! }];
    expect(() => getShapeTextWarpNativeSource(stale)).toThrow(/own each native run/);
    const repeated = layout("first\nsecond");
    repeated.lines[1]!.runs.push(repeated.runs[0]!);
    expect(() => getShapeTextWarpNativeSource(repeated)).toThrow(/own each native run/);
    const invalid = layout();
    invalid.runs[0]!.inlineAdvancePx = Infinity;
    expect(() => getShapeTextWarpNativeSource(invalid)).toThrow(/finite/);
    invalid.runs[0]!.inlineAdvancePx = -1;
    expect(() => getShapeTextWarpNativeSource(invalid)).toThrow(/negative/);
  });
});
