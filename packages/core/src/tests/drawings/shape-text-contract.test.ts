import { describe, expect, expectTypeOf, test } from "vitest";
import {
  areShapeTextsEqual,
  cloneShapeText,
  getShapeTextAssetIds,
  normalizeShapeText,
  type ShapeText,
  type ShapeTextStyle,
} from "../../shape-text.js";
import type { ShapeDetailedStyle } from "../../shape-style.js";
import {
  normalizeSheetDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
} from "../../sheet-drawings.js";
import { fullStyle, gradient } from "../images/detailed-style-fixture.js";
import { freePathDrawing } from "./free-path-fixture.js";
import { legacyShapeDrawing, textureShapeStyle } from "./shape-style-fixture.js";
import { shapeText, textDrawing } from "./shape-text-fixture.js";

function assertDetached(source: unknown, target: unknown) {
  if (!source || typeof source !== "object") return;
  expect(target).not.toBe(source);
  for (const [key, value] of Object.entries(source))
    assertDetached(value, (target as Record<string, unknown>)[key]);
}
function reversed(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversed);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, item]) => [key, reversed(item)]),
  );
}

describe("strict opt-in shape text contract", () => {
  test("every direction, logical alignment, paragraph choice and boolean persists on both eligible kinds", () => {
    for (const direction of [
      "horizontal",
      "vertical-rl",
      "vertical-lr",
      "rotate-90",
      "rotate-270",
      "stacked",
    ] as const)
      for (const blockAlignment of ["start", "center", "end"] as const)
        for (const lineOrder of ["rtl", "ltr"] as const)
          for (const alignment of ["left", "center", "right", "justify"] as const)
            for (const enabled of [false, true]) {
              const model = shapeText();
              Object.assign(model.layout, {
                direction,
                blockAlignment,
                lineOrder,
                wrap: enabled,
                overflow: enabled,
                keepFlat: enabled,
                autoFit: enabled ? "resize-shape" : "none",
              });
              Object.assign(model.paragraph, {
                alignment,
                beforePt: 4096,
                afterPt: 4096,
                lineSpacing: enabled ? { kind: "exact", pt: 4096 } : { kind: "normal" },
              });
              model.layout.marginsPt = { leftPt: 0, rightPt: 4096, topPt: 0, bottomPt: 4096 };
              for (const kind of ["shape", "textBox"] as const) {
                const input = { ...textDrawing(model), kind };
                expect(normalizeSheetDrawing(input)).toEqual(input);
              }
            }
  });

  test("style shares strict types but body and glyph records deeply detach independently", () => {
    expectTypeOf<ShapeTextStyle>().toEqualTypeOf<ShapeDetailedStyle>();
    for (const style of [fullStyle(), textureShapeStyle()]) {
      const model = {
        ...shapeText(),
        fontFamily: "SheetcraftLocal_0123456789abcdef",
        underline: true as const,
        strike: true as const,
        style,
      };
      const input = { ...textDrawing(model), shapeStyle: style },
        normalized = normalizeSheetDrawing(input) as SheetGraphicDrawing;
      expect(normalized).toEqual(input);
      assertDetached(model, normalized.shapeText);
      assertDetached(style, normalized.shapeStyle);
      assertDetached(normalized.shapeStyle, normalized.shapeText!.style);
      const copy = cloneShapeText(model)!;
      expect(copy).toEqual(model);
      assertDetached(model, copy);
      expect(normalized).toMatchObject({
        text: input.text,
        color: input.color,
        fontSize: input.fontSize,
        bold: input.bold,
        italic: input.italic,
        height: input.height,
      });
    }
    for (const drawing of [
      legacyShapeDrawing(),
      { ...legacyShapeDrawing(), shapeGeometry: { preset: "rect" as const } },
      freePathDrawing(),
    ])
      expect(normalizeSheetDrawing({ ...drawing, shapeText: shapeText() })).toEqual({
        ...drawing,
        shapeText: shapeText(),
      });
  });

  test("explicit default markers survive; undefined is absent and false decorations are canonical absences", () => {
    const plain = legacyShapeDrawing();
    expect(normalizeShapeText(undefined)).toBeUndefined();
    expect(cloneShapeText(undefined)).toBeUndefined();
    expect(normalizeSheetDrawing({ ...plain, shapeText: undefined })).toEqual(plain);
    expect(normalizeShapeText(shapeText())).toEqual(shapeText());
    expect(
      normalizeShapeText({ ...shapeText(), underline: false, strike: false, style: {} }),
    ).toEqual(shapeText());
    const input = shapeText();
    input.layout.marginsPt.leftPt = -0;
    input.paragraph.beforePt = -0;
    const expected = shapeText();
    expected.layout.marginsPt.leftPt = 0;
    expect(JSON.stringify(normalizeShapeText(reversed(input)))).toBe(JSON.stringify(expected));
    expect(Object.is(normalizeShapeText(input)!.paragraph.beforePt, -0)).toBe(false);
    expect(areShapeTextsEqual(input, expected)).toBe(true);
    expect(areShapeTextsEqual(undefined, undefined)).toBe(true);
    expect(areShapeTextsEqual(undefined, shapeText())).toBe(false);
  });

  test("asset IDs are glyph-owned, ordered and deduplicated with explicit None retained", () => {
    expect(getShapeTextAssetIds({ ...shapeText(), style: textureShapeStyle() })).toEqual([
      "fill-texture",
      "line-texture",
    ]);
    expect(
      getShapeTextAssetIds({ ...shapeText(), style: textureShapeStyle("same", "same") }),
    ).toEqual(["same"]);
    expect(getShapeTextAssetIds(undefined)).toEqual([]);
    expect(getShapeTextAssetIds({ ...shapeText(), style: fullStyle() })).toEqual([]);
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
      const model = { ...shapeText(), style: { [category]: { kind: "none" } } };
      expect(normalizeShapeText(model)).toEqual(model);
    }
  });

  test("property presence on unrelated kinds and competing legacy direction owners reject", () => {
    for (const kind of [
      "wordArt",
      "icon",
      "equation",
      "chart",
      "attachment",
      "control",
      "camera",
    ] as const)
      for (const model of [shapeText(), {}, undefined]) {
        const drawing = {
          ...textDrawing(),
          kind,
          shapeText: model,
          ...(kind === "camera" ? { camera: { range: null, gridLines: true } } : {}),
        } as unknown as SheetDrawing;
        expect(() => normalizeSheetDrawing(drawing)).toThrow(/Only shape or text box/);
      }
    for (const model of [shapeText(), undefined])
      for (const textDirection of ["vertical", undefined])
        expect(() =>
          normalizeSheetDrawing({
            ...legacyShapeDrawing(),
            kind: "textBox",
            shapeText: model,
            textDirection,
          } as SheetGraphicDrawing),
        ).toThrow(/mutually exclusive/);
    const legacy = {
      ...legacyShapeDrawing(),
      kind: "textBox" as const,
      textDirection: "vertical" as const,
    };
    expect(normalizeSheetDrawing(legacy)).toEqual(legacy);
    expect(normalizeSheetDrawing(legacy)).not.toHaveProperty("shapeText");
  });

  test("all model records reject missing, unknown, inherited, symbol, accessor and array fields", () => {
    for (const invalid of [
      null,
      [],
      new Date(0),
      "model",
      1,
      {},
      { layout: shapeText().layout },
      Object.create(shapeText()),
      { ...shapeText(), text: "duplicate" },
      { ...shapeText(), fontSize: 12 },
      { ...shapeText(), [Symbol("layout")]: true },
    ])
      expect(() => normalizeShapeText(invalid)).toThrow();
    const keys: Array<["layout" | "paragraph", string[]]> = [
      [
        "layout",
        [
          "blockAlignment",
          "direction",
          "lineOrder",
          "marginsPt",
          "wrap",
          "overflow",
          "autoFit",
          "keepFlat",
        ],
      ],
      ["paragraph", ["alignment", "beforePt", "afterPt", "lineSpacing"]],
    ];
    for (const [category, fields] of keys) {
      for (const field of fields) {
        const model = shapeText();
        delete (model[category] as unknown as Record<string, unknown>)[field];
        expect(() => normalizeShapeText(model)).toThrow();
      }
      for (const invalid of [
        [],
        Object.create(shapeText()[category]),
        { ...shapeText()[category], unknown: true },
        { ...shapeText()[category], [Symbol("field")]: true },
      ])
        expect(() => normalizeShapeText({ ...shapeText(), [category]: invalid })).toThrow();
    }
    for (const invalid of [
      [],
      {},
      Object.create(shapeText().layout.marginsPt),
      { ...shapeText().layout.marginsPt, extra: 0 },
    ])
      expect(() =>
        normalizeShapeText({
          ...shapeText(),
          layout: { ...shapeText().layout, marginsPt: invalid },
        }),
      ).toThrow();
    for (const lineSpacing of [
      { kind: "normal", pt: 1 },
      { kind: "exact" },
      { kind: "exact", pt: 1, extra: 0 },
      Object.create({ kind: "normal" }),
      [],
    ])
      expect(() =>
        normalizeShapeText({
          ...shapeText(),
          paragraph: { ...shapeText().paragraph, lineSpacing },
        }),
      ).toThrow();
    for (const style of [
      { unknown: true },
      { fill: { kind: "none", value: {} } },
      {
        fill: {
          kind: "value",
          value: { ...gradient(), stops: Object.assign(gradient().stops, { extra: true }) },
        },
      },
    ])
      expect(() => normalizeShapeText({ ...shapeText(), style })).toThrow();
  });

  test("invalid enums, booleans, finite point bounds and exact font identities reject", () => {
    for (const [key, values] of Object.entries({
      blockAlignment: ["top", "middle", "bottom"],
      direction: ["vertical", "rotate90"],
      lineOrder: ["auto", "RTL"],
      autoFit: ["shrink-text", true],
      wrap: [1, undefined],
      overflow: ["true", null],
      keepFlat: [1, undefined],
    }))
      for (const value of values)
        expect(() =>
          normalizeShapeText({ ...shapeText(), layout: { ...shapeText().layout, [key]: value } }),
        ).toThrow();
    for (const value of [NaN, Infinity, -Infinity, -1, 4096.01, "1", undefined]) {
      for (const key of ["leftPt", "rightPt", "topPt", "bottomPt"])
        expect(() =>
          normalizeShapeText({
            ...shapeText(),
            layout: {
              ...shapeText().layout,
              marginsPt: { ...shapeText().layout.marginsPt, [key]: value },
            },
          }),
        ).toThrow();
      for (const key of ["beforePt", "afterPt"])
        expect(() =>
          normalizeShapeText({
            ...shapeText(),
            paragraph: { ...shapeText().paragraph, [key]: value },
          }),
        ).toThrow();
      expect(() =>
        normalizeShapeText({
          ...shapeText(),
          paragraph: { ...shapeText().paragraph, lineSpacing: { kind: "exact", pt: value } },
        }),
      ).toThrow();
    }
    for (const value of [0, -0])
      expect(() =>
        normalizeShapeText({
          ...shapeText(),
          paragraph: { ...shapeText().paragraph, lineSpacing: { kind: "exact", pt: value } },
        }),
      ).toThrow();
    for (const alignment of ["start", "auto", undefined])
      expect(() =>
        normalizeShapeText({ ...shapeText(), paragraph: { ...shapeText().paragraph, alignment } }),
      ).toThrow();
    for (const fontFamily of [
      "",
      " ",
      " Arial",
      "Arial ",
      "x".repeat(257),
      "A\nB",
      "A\u0000B",
      "A\u007fB",
      "A\u0085B",
      "A\ud800",
      "A\udc00",
      "A\ud800B",
      undefined,
      1,
    ])
      expect(() => normalizeShapeText({ ...shapeText(), fontFamily })).toThrow();
    for (const fontFamily of ["x".repeat(256), "思源宋体", "Family😀", "SheetcraftLocal_abcdef"])
      expect(normalizeShapeText({ ...shapeText(), fontFamily })!.fontFamily).toBe(fontFamily);
    for (const key of ["underline", "strike"])
      for (const value of [undefined, 1, "true"])
        expect(() => normalizeShapeText({ ...shapeText(), [key]: value })).toThrow();
  });

  test("model, nested records and outer drawing getters are never executed", () => {
    let reads = 0;
    const getter = {
      get() {
        reads++;
        return shapeText();
      },
      enumerable: true,
    };
    for (const location of [
      "model",
      "layout",
      "margins",
      "paragraph",
      "spacing",
      "style",
    ] as const) {
      const model: ShapeText = { ...shapeText(), style: fullStyle() };
      const target =
        location === "model"
          ? model
          : location === "layout"
            ? model.layout
            : location === "margins"
              ? model.layout.marginsPt
              : location === "paragraph"
                ? model.paragraph
                : location === "spacing"
                  ? model.paragraph.lineSpacing
                  : model.style!;
      const key =
        location === "model"
          ? "layout"
          : location === "layout"
            ? "direction"
            : location === "margins"
              ? "leftPt"
              : location === "paragraph"
                ? "alignment"
                : location === "spacing"
                  ? "kind"
                  : "fill";
      Object.defineProperty(target, key, getter);
      expect(() => normalizeShapeText(model)).toThrow();
    }
    const own = legacyShapeDrawing();
    Object.defineProperty(own, "shapeText", getter);
    expect(() => normalizeSheetDrawing(own)).toThrow(/accessor/);
    const inherited = Object.assign(
      Object.create({
        get shapeText() {
          reads++;
          return shapeText();
        },
      }),
      legacyShapeDrawing(),
    );
    expect(() => normalizeSheetDrawing(inherited)).toThrow(/own data/);
    expect(reads).toBe(0);
  });

  test("null-prototype and nonenumerable data are copied into canonical ordinary records", () => {
    const input = Object.create(null);
    Object.defineProperty(input, "paragraph", { value: shapeText().paragraph });
    Object.defineProperty(input, "layout", { value: shapeText().layout });
    expect(normalizeShapeText(input)).toEqual(shapeText());
    expect(Object.getPrototypeOf(normalizeShapeText(input)!)).toBe(Object.prototype);
  });
});
