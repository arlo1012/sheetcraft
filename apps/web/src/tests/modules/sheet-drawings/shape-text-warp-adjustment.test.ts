import { afterEach, describe, expect, test, vi } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import * as textWarps from "@sheetcraft/core/text-warps";
import { evaluateTextWarp, type ShapeTextWarp } from "@sheetcraft/core/text-warps";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { standardShapeFlipPoint } from "../../../modules/sheet-drawings/shape-geometry";
import { getDrawingShapeTextRect } from "../../../modules/sheet-drawings/shape-text-runtime";
import {
  getDrawingShapeTextWarpAdjustments,
  moveDrawingShapeTextWarpAdjustment,
  nudgeDrawingShapeTextWarpAdjustment,
} from "../../../modules/sheet-drawings/shape-text-warp-adjustment";

afterEach(() => vi.restoreAllMocks());

function drawing(overrides: Partial<SheetGraphicDrawing> = {}): SheetGraphicDrawing {
  const base = createGraphicDrawing("wordart", "shape", "WordArt", { row: 2, column: 3 });
  return {
    ...base,
    width: 240,
    height: 160,
    text: "Native WordArt",
    rotation: 37,
    shapeGeometry: { preset: "triangle" },
    wordArt: true,
    shapeText: {
      ...base.shapeText!,
      fontFamily: "Noto Sans",
      underline: true,
      characterRuns: [{ start: 0, end: 6, bold: true }],
      warp: { preset: "textWave1", adjustments: { adj1: 17000, adj2: -3500 } },
    },
    ...overrides,
  };
}

function point(d: SheetGraphicDrawing, warp: ShapeTextWarp, index: number) {
  const rect = getDrawingShapeTextRect(d)!;
  const local = evaluateTextWarp(warp, rect.width, rect.height).handles[index]!.position;
  return standardShapeFlipPoint(d, { x: rect.x + local.x, y: rect.y + local.y });
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe("drawing glyph-warp adjustment coordinates", () => {
  test.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const)("uses the actual native text rectangle and full frame reflection X%s Y%s", (x, y) => {
    const source = drawing({
      ...(x ? { shapeFlipX: true } : {}),
      ...(y ? { shapeFlipY: true } : {}),
    });
    const rect = getDrawingShapeTextRect(source)!;
    expect(rect).not.toEqual({ x: 0, y: 0, width: source.width, height: source.height });
    expect(rect.y + rect.height / 2).not.toBe(source.height / 2);
    const geometry = evaluateTextWarp(source.shapeText!.warp!, rect.width, rect.height);
    const descriptors = getDrawingShapeTextWarpAdjustments(source);
    expect(descriptors.map((handle) => handle.index)).toEqual([0, 1]);
    descriptors.forEach((handle) => {
      expect(handle.position).toEqual({
        x: rect.x + geometry.handles[handle.index]!.position.x,
        y: rect.y + geometry.handles[handle.index]!.position.y,
      });
      expect(handle.paintedPosition).toEqual(standardShapeFlipPoint(source, handle.position));
      expect(handle.fields).toEqual(geometry.handles[handle.index]!.fields);
    });
  });

  test.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const)("inverts both independent wave handles without changing the body X%s Y%s", (x, y) => {
    const source = freeze(
      drawing({
        ...(x ? { shapeFlipX: true } : {}),
        ...(y ? { shapeFlipY: true } : {}),
      }),
    );
    const before = structuredClone(source);
    for (const index of [0, 1]) {
      const known: ShapeTextWarp = {
        preset: "textWave1",
        adjustments: {
          ...source.shapeText!.warp!.adjustments,
          ...(index === 0 ? { adj1: 7000 } : { adj2: 6300 }),
        },
      };
      const target = point(source, known, index);
      const result = moveDrawingShapeTextWarpAdjustment(source, index, target)!;
      expect(result).toBeDefined();
      const actual = point(result, result.shapeText!.warp!, index);
      expect(actual.x).toBeCloseTo(target.x, 5);
      expect(actual.y).toBeCloseTo(target.y, 5);
      expect(result.shapeText!.warp!.adjustments?.[index === 0 ? "adj2" : "adj1"]).toBe(
        source.shapeText!.warp!.adjustments![index === 0 ? "adj2" : "adj1"],
      );
      expect({
        ...result,
        shapeText: { ...result.shapeText!, warp: source.shapeText!.warp },
      }).toEqual(source);
      expect(result.shapeGeometry).toBe(source.shapeGeometry);
      expect(result.shapeText!.layout).toBe(source.shapeText!.layout);
      expect(result.shapeText!.paragraph).toBe(source.shapeText!.paragraph);
      expect(result.shapeText!.characterRuns).toBe(source.shapeText!.characterRuns);
      expect(getDrawingShapeTextRect(result)).toEqual(getDrawingShapeTextRect(source));
    }
    expect(source).toEqual(before);
  });

  test("inverts a polar handle in a text box without replacing body or text styling", () => {
    const source = drawing({ kind: "textBox", shapeGeometry: undefined, shapeFlipX: true });
    source.shapeText!.warp = {
      preset: "textCirclePour",
      adjustments: { adj1: 6500000, adj2: 45000 },
    };
    const known: ShapeTextWarp = {
      preset: "textCirclePour",
      adjustments: { adj1: 7310000, adj2: 63000 },
    };
    const target = point(source, known, 0);
    const result = moveDrawingShapeTextWarpAdjustment(source, 0, target)!;
    expect(result).toBeDefined();
    const actual = point(result, result.shapeText!.warp!, 0);
    expect(actual.x).toBeCloseTo(target.x, 5);
    expect(actual.y).toBeCloseTo(target.y, 5);
    expect({
      ...result,
      shapeText: { ...result.shapeText!, warp: source.shapeText!.warp },
    }).toEqual(source);
  });

  test.each([false, true])("nudges in painted local axes with vertical flip %s", (flip) => {
    const source = drawing(flip ? { shapeFlipY: true } : {});
    const before = getDrawingShapeTextWarpAdjustments(source)[0]!;
    const result = nudgeDrawingShapeTextWarpAdjustment(source, 0, { x: 0, y: 1 })!;
    const after = getDrawingShapeTextWarpAdjustments(result)[0]!;
    expect(after.paintedPosition.x).toBeCloseTo(before.paintedPosition.x, 5);
    expect(after.paintedPosition.y).toBeCloseTo(before.paintedPosition.y + 1, 5);
    expect(
      result.shapeText!.warp!.adjustments!.adj1! > source.shapeText!.warp!.adjustments!.adj1!,
    ).toBe(!flip);
  });

  test("preserves declared indices while suppressing a disabled singular handle", () => {
    const actual = textWarps.evaluateTextWarp;
    vi.spyOn(textWarps, "evaluateTextWarp").mockImplementation((input, width, height) => {
      const geometry = actual(input, width, height);
      return {
        ...geometry,
        handles: geometry.handles.map((handle, index) => ({
          ...handle,
          fields: handle.fields.map((field) => ({
            ...field,
            ...(index === 0 ? { disabled: true, minimum: 3000, maximum: 1000 } : {}),
          })),
        })),
      };
    });
    const source = drawing();
    expect(getDrawingShapeTextWarpAdjustments(source).map((handle) => handle.index)).toEqual([1]);
    expect(moveDrawingShapeTextWarpAdjustment(source, 0, { x: 10, y: 20 })).toBeUndefined();
    expect(nudgeDrawingShapeTextWarpAdjustment(source, 0, { x: 0, y: 1 })).toBeUndefined();
  });

  test("rejects missing domains, inactive warps and invalid targets without body fallback", () => {
    const base = drawing();
    const inactive = { ...base, shapeText: { ...base.shapeText!, warp: undefined } };
    const open = drawing({
      shapeGeometry: undefined,
      shapePath: {
        tool: "curve",
        viewBox: { width: 100, height: 100 },
        commands: [
          ["M", 0, 0],
          ["L", 100, 100],
        ],
      },
    });
    for (const source of [inactive, open, drawing({ kind: "wordArt" }), drawing({ width: 0 })]) {
      expect(getDrawingShapeTextWarpAdjustments(source)).toEqual([]);
      expect(moveDrawingShapeTextWarpAdjustment(source, 0, { x: 10, y: 20 })).toBeUndefined();
    }
    for (const index of [-1, 0.5, 99, NaN])
      expect(moveDrawingShapeTextWarpAdjustment(base, index, { x: 10, y: 20 })).toBeUndefined();
    for (const target of [
      { x: NaN, y: 0 },
      { x: 0, y: Infinity },
      { x: 10_000_001, y: 0 },
    ]) {
      expect(moveDrawingShapeTextWarpAdjustment(base, 0, target)).toBeUndefined();
      expect(nudgeDrawingShapeTextWarpAdjustment(base, 0, target)).toBeUndefined();
    }
  });
});
