import { describe, expect, expectTypeOf, test } from "vitest";
import {
  cloneShapeStyle,
  getShapeStyleAssetIds,
  normalizeShapeStyle,
  type ShapeDetailedStyle,
} from "../../shape-style.js";
import type { PictureDetailedStyle } from "../../picture-detailed-style.js";
import {
  normalizeSheetDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
} from "../../sheet-drawings.js";
import { fullStyle, gradient, line, picturePaint, rgb } from "../images/detailed-style-fixture.js";
import { freePathDrawing } from "./free-path-fixture.js";
import {
  legacyShapeDrawing,
  styledShapeDrawing,
  textureShapeStyle,
} from "./shape-style-fixture.js";

function normalize(value: unknown) {
  return normalizeShapeStyle(value as ShapeDetailedStyle);
}
function withStyle(value: unknown): SheetGraphicDrawing {
  return { ...legacyShapeDrawing(), shapeStyle: value as ShapeDetailedStyle };
}
function assertDetached(source: unknown, target: unknown) {
  if (!source || typeof source !== "object") return;
  expect(target).not.toBe(source);
  for (const [key, value] of Object.entries(source))
    assertDetached(value, (target as Record<string, unknown>)[key]);
}

describe("strict typed shape appearance contract", () => {
  test("shape style reuses the picture style type and clone contract exactly", () => {
    expectTypeOf<ShapeDetailedStyle>().toEqualTypeOf<PictureDetailedStyle>();
    for (const input of [fullStyle(), textureShapeStyle()]) {
      const cloned = cloneShapeStyle(input)!;
      expect(cloned).toEqual(input);
      assertDetached(input, cloned);
    }
    expect(cloneShapeStyle({})).toBeUndefined();
    expect(cloneShapeStyle(undefined)).toBeUndefined();
  });

  test("rich paint, line and every effect remain lossless and deeply detached", () => {
    for (const input of [fullStyle(), textureShapeStyle()]) {
      const expected = structuredClone(input),
        normalized = normalizeShapeStyle(input)!;
      expect(normalized).toEqual(expected);
      assertDetached(input, normalized);
      const drawing = withStyle(input),
        normalizedDrawing = normalizeSheetDrawing(drawing) as SheetGraphicDrawing;
      expect(normalizedDrawing).toEqual(drawing);
      assertDetached(input, normalizedDrawing.shapeStyle);
      input.fill = { kind: "none" };
      input.line = { kind: "none" };
      input.shadow = { kind: "none" };
      expect(normalized).toEqual(expected);
      expect(normalizedDrawing.shapeStyle).toEqual(expected);
      expect(normalizedDrawing).toMatchObject({
        fill: "#abcdef",
        stroke: "#000000",
        strokeWidth: 2,
        color: "#123456",
        rotation: 37,
      });
    }
  });

  test("style is shape-only and accepts each legacy shape, standard geometry and open or closed free paths", () => {
    for (const shape of [
      "rectangle",
      "roundedRectangle",
      "ellipse",
      "triangle",
      "diamond",
      "arrow",
      "line",
      "star",
      "heart",
    ] as const) {
      const drawing = { ...styledShapeDrawing(), shape };
      expect(normalizeSheetDrawing(drawing)).toEqual(drawing);
    }
    const open = freePathDrawing();
    for (const drawing of [
      {
        ...styledShapeDrawing(),
        shapeGeometry: { preset: "roundRect" as const, adjustments: { adj: 30000 } },
      },
      { ...open, shapeStyle: fullStyle() },
      {
        ...open,
        shapePath: { ...open.shapePath!, commands: [...open.shapePath!.commands, ["Z"] as ["Z"]] },
        shapeStyle: fullStyle(),
      },
    ])
      expect(normalizeSheetDrawing(drawing)).toEqual(drawing);
    for (const kind of [
      "textBox",
      "wordArt",
      "icon",
      "equation",
      "chart",
      "attachment",
      "control",
    ] as const)
      for (const shapeStyle of [fullStyle(), {}, undefined])
        expect(() =>
          normalizeSheetDrawing({ ...withStyle(shapeStyle), kind } as unknown as SheetDrawing),
        ).toThrow(/Only a shape/);
    expect(() =>
      normalizeSheetDrawing({
        ...styledShapeDrawing(),
        kind: "camera",
        camera: { range: null, gridLines: true },
      }),
    ).toThrow(/Only a shape/);
  });

  test("empty and undefined styles disappear; explicit None persists for every category", () => {
    const plain = legacyShapeDrawing();
    for (const shapeStyle of [{}, undefined]) {
      expect(normalizeShapeStyle(shapeStyle)).toBeUndefined();
      const normalized = normalizeSheetDrawing({ ...plain, shapeStyle });
      expect(normalized).toEqual(plain);
      expect(Object.hasOwn(normalized, "shapeStyle")).toBe(false);
    }
    for (const category of [
      "fill",
      "line",
      "shadow",
      "reflection",
      "glow",
      "softEdges",
      "format3d",
      "rotation3d",
    ] as const) {
      const style = { [category]: { kind: "none" } };
      expect(normalize(style)).toEqual(style);
      expect(normalizeSheetDrawing(withStyle(style))).toMatchObject({ shapeStyle: style });
    }
  });

  test("fill and line picture paint asset IDs are ordered and deduplicated", () => {
    expect(getShapeStyleAssetIds(textureShapeStyle())).toEqual(["fill-texture", "line-texture"]);
    expect(getShapeStyleAssetIds(textureShapeStyle("same", "same"))).toEqual(["same"]);
    expect(
      getShapeStyleAssetIds({ line: { kind: "value", value: line(picturePaint("outline")) } }),
    ).toEqual(["outline"]);
    expect(getShapeStyleAssetIds(fullStyle())).toEqual([]);
    expect(getShapeStyleAssetIds({ fill: { kind: "none" }, line: { kind: "none" } })).toEqual([]);
    expect(getShapeStyleAssetIds(undefined)).toEqual([]);
  });

  test("root and nested records reject inherited, unknown, symbol and malformed fields", () => {
    const fill = (value: unknown) => ({ fill: { kind: "value", value } }),
      sparseStops = gradient().stops;
    delete (sparseStops as unknown[])[1];
    for (const invalid of [
      null,
      [],
      new Date(0),
      "style",
      1,
      Object.create({ fill: { kind: "none" } }),
      { unknown: true },
      { [Symbol("fill")]: true },
      { fill: undefined },
      { fill: { kind: "none", value: {} } },
      { fill: { kind: "value" } },
      { line: { local: { kind: "none" }, inheritedOutline: "inherit" } },
      fill({ kind: "solid", color: { kind: "rgb", rgb: "red" }, opacity: 1 }),
      fill({
        kind: "solid",
        color: { kind: "theme", reference: Object.create({ slot: "accent1" }) },
        opacity: 1,
      }),
      fill({
        kind: "solid",
        color: { kind: "theme", reference: { slot: "accent1", extra: true } },
        opacity: 1,
      }),
      fill({ ...gradient(), centerX: 0.5 }),
      fill({ ...gradient(), stops: sparseStops }),
      fill({ ...gradient(), stops: Object.assign(gradient().stops, { extra: true }) }),
      fill({
        ...gradient(),
        stops: [{ ...gradient().stops[0]!, opacity: NaN }, gradient().stops[1]!],
      }),
      fill({ kind: "solid", color: rgb(), opacity: Infinity }),
      { line: { kind: "value", value: { ...line(), widthPt: -1 } } },
      { shadow: { kind: "value", value: { kind: "outer", unexpected: true } } },
      { softEdges: { kind: "value", value: { sizePt: NaN } } },
    ]) {
      expect(() => normalize(invalid)).toThrow();
      expect(() => normalizeSheetDrawing(withStyle(invalid))).toThrow();
    }
  });

  test("picture paints reject external sources, bad asset IDs and invalid layout fields", () => {
    for (const paint of [
      { ...picturePaint(), assetId: "" },
      { ...picturePaint(), assetId: "https://example.com/a.png" },
      { ...picturePaint(), source: "external" },
      { ...picturePaint(), opacity: 1.1 },
      {
        ...picturePaint(),
        layout: {
          kind: "tile",
          scaleX: 0,
          scaleY: 1,
          offsetXPt: 0,
          offsetYPt: 0,
          flip: "none",
          anchor: "center",
        },
      },
      { ...picturePaint(), layout: { ...picturePaint().layout, unexpected: true } },
      {
        ...picturePaint(),
        layout: {
          kind: "stretch",
          offsetXRatio: 0,
          offsetYRatio: 0,
          widthRatio: Infinity,
          heightRatio: 1,
        },
      },
      { ...picturePaint(), layout: Object.create(picturePaint().layout) },
    ]) {
      expect(() => normalize({ fill: { kind: "value", value: paint } })).toThrow();
      expect(() =>
        normalize({
          line: { kind: "value", value: line(paint as ReturnType<typeof picturePaint>) },
        }),
      ).toThrow();
    }
  });

  test("outer, category, paint, stop, theme and picture-layout accessors are never executed", () => {
    let reads = 0;
    const getter = {
        get() {
          reads++;
          return fullStyle();
        },
        enumerable: true,
      },
      styleMutations = [
        (style: ShapeDetailedStyle) => Object.defineProperty(style, "fill", getter),
        (style: ShapeDetailedStyle) => Object.defineProperty(style.fill!, "value", getter),
        (style: ShapeDetailedStyle) => {
          if (style.fill?.kind === "value" && style.fill.value.kind === "linear") {
            Object.defineProperty(style.fill.value, "opacity", getter);
          }
        },
        (style: ShapeDetailedStyle) => {
          if (style.fill?.kind === "value" && style.fill.value.kind === "linear") {
            Object.defineProperty(style.fill.value.stops, "0", getter);
          }
        },
        (style: ShapeDetailedStyle) => {
          if (style.fill?.kind === "value" && style.fill.value.kind === "linear") {
            Object.defineProperty(style.fill.value.stops[0]!, "brightness", getter);
          }
        },
        (style: ShapeDetailedStyle) => {
          if (style.glow?.kind === "value" && style.glow.value.color.kind === "theme") {
            Object.defineProperty(style.glow.value.color.reference, "slot", getter);
          }
        },
      ];
    for (const mutate of styleMutations) {
      const style = fullStyle();
      mutate(style);
      expect(() => normalizeShapeStyle(style)).toThrow();
      expect(() => normalizeSheetDrawing(withStyle(style))).toThrow();
    }
    for (const key of ["assetId", "layout"] as const) {
      const paint = picturePaint();
      Object.defineProperty(paint, key, getter);
      expect(() => normalize({ fill: { kind: "value", value: paint } })).toThrow();
    }
    const paint = picturePaint();
    Object.defineProperty(paint.layout, "scaleX", getter);
    expect(() => normalize({ fill: { kind: "value", value: paint } })).toThrow();
    const own = legacyShapeDrawing();
    Object.defineProperty(own, "shapeStyle", getter);
    expect(() => normalizeSheetDrawing(own)).toThrow(/accessor/);
    const inherited = Object.assign(
      Object.create({
        get shapeStyle() {
          reads++;
          return fullStyle();
        },
      }),
      legacyShapeDrawing(),
    );
    expect(() => normalizeSheetDrawing(inherited)).toThrow(/own data/);
    expect(reads).toBe(0);
  });

  test("null-prototype and nonenumerable own data normalize into ordinary records", () => {
    const style = Object.create(null);
    Object.defineProperty(style, "fill", { value: { kind: "none" } });
    expect(normalize(style)).toEqual({ fill: { kind: "none" } });
    expect(Object.getPrototypeOf(normalize(style)!)).toBe(Object.prototype);
    const drawing = legacyShapeDrawing();
    Object.defineProperty(drawing, "shapeStyle", { value: style });
    expect(normalizeSheetDrawing(drawing)).toEqual({
      ...legacyShapeDrawing(),
      shapeStyle: { fill: { kind: "none" } },
    });
  });
});
