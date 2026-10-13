import { describe, expect, test } from "vitest";
import {
  areShapeTextsEqual,
  cloneShapeText,
  getShapeTextAssetIds,
  normalizeShapeText,
} from "../../shape-text.js";
import { normalizeSheetDrawing, type SheetDrawing } from "../../sheet-drawings.js";
import { collectShapeGroupAssetIds, normalizeShapeGroup } from "../../shape-group.js";
import { TEXT_WARP_PRESET_DEFAULTS, TEXT_WARP_PRESET_NAMES } from "../../text-warps/catalog.js";
import { shapeText } from "../drawings/shape-text-fixture.js";
import { legacyShapeDrawing } from "../drawings/shape-style-fixture.js";
import { warpedDrawing, warpedText, warpedTree, WARP_OWNER_TEXT } from "./model-fixtures.js";

describe("sparse ShapeText warp model", () => {
  test("every catalog preset is active and sparse defaults do not change text or existing metadata", () => {
    for (const preset of TEXT_WARP_PRESET_NAMES) {
      const input = warpedText({ preset, adjustments: TEXT_WARP_PRESET_DEFAULTS[preset] });
      const expected = { ...input, warp: { preset } };
      const normalized = normalizeShapeText(input, WARP_OWNER_TEXT)!;
      expect(normalized, preset).toEqual(expected);
      expect(normalized.warp, preset).not.toBe(input.warp);
      for (const kind of ["shape", "textBox"] as const) {
        const drawing = { ...warpedDrawing(kind), shapeText: input };
        expect(normalizeSheetDrawing(drawing)).toEqual({ ...drawing, shapeText: expected });
      }
    }
    expect(normalizeShapeText(warpedText({ preset: "textPlain" }), WARP_OWNER_TEXT)!.warp).toEqual({
      preset: "textPlain",
    });
  });

  test("clone and equality retain deep detached overrides while None is only field absence", () => {
    const source = warpedText(),
      copy = cloneShapeText(source, WARP_OWNER_TEXT)!;
    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
    expect(copy.warp).not.toBe(source.warp);
    expect(copy.warp!.adjustments).not.toBe(source.warp!.adjustments);
    (copy.warp!.adjustments as Record<string, number>).adj1 = 9000;
    expect(source.warp!.adjustments!.adj1).toBe(17000);
    expect(areShapeTextsEqual(source, copy, WARP_OWNER_TEXT)).toBe(false);
    expect(
      areShapeTextsEqual(source, cloneShapeText(source, WARP_OWNER_TEXT), WARP_OWNER_TEXT),
    ).toBe(true);
    const defaults = warpedText({ preset: "textWave1", adjustments: { adj1: 12500, adj2: -0 } });
    expect(areShapeTextsEqual(defaults, warpedText({ preset: "textWave1" }), WARP_OWNER_TEXT)).toBe(
      true,
    );
    const { warp: _warp, ...none } = source;
    expect(normalizeShapeText(none, WARP_OWNER_TEXT)).toEqual(none);
    expect(normalizeShapeText(none, WARP_OWNER_TEXT)).not.toHaveProperty("warp");
    expect(areShapeTextsEqual(source, none, WARP_OWNER_TEXT)).toBe(false);
  });

  test("warp adds no assets and leaves existing glyph and owned-group asset traversal intact", () => {
    expect(getShapeTextAssetIds({ ...shapeText(), warp: { preset: "textCircle" } })).toEqual([]);
    expect(getShapeTextAssetIds(warpedText(), WARP_OWNER_TEXT)).toEqual([
      "glyph-fill",
      "glyph-line",
    ]);
    const tree = warpedTree();
    expect(normalizeShapeGroup(tree)).toEqual(tree);
    expect([...collectShapeGroupAssetIds(tree)]).toEqual(["glyph-fill", "glyph-line"]);
  });

  test("explicit malformed, inherited, accessor and unknown warp fields reject without getter reads", () => {
    let reads = 0;
    const getter = {
      get() {
        reads++;
        return { preset: "textPlain" };
      },
      enumerable: true,
    };
    const own = Object.defineProperty(shapeText(), "warp", getter);
    const inherited = Object.assign(
      Object.create({
        get warp() {
          reads++;
          return undefined;
        },
      }),
      shapeText(),
    );
    const nested = Object.defineProperty({ preset: "textPlain" }, "adjustments", getter);
    const presetGetter = Object.defineProperty({}, "preset", getter);
    for (const invalid of [
      undefined,
      null,
      {},
      [],
      "textPlain",
      { preset: "textNoShape" },
      { preset: "rect" },
      { preset: "textPlain", text: "duplicate" },
      { preset: "textPlain", adjustments: { bogus: 1 } },
      { preset: "textPlain", adjustments: { adj: NaN } },
      { preset: "textPlain", adjustments: null },
      { preset: "textPlain", [Symbol("warp")]: true },
      Object.create({ preset: "textPlain" }),
      nested,
      presetGetter,
    ])
      expect(() => normalizeShapeText({ ...shapeText(), warp: invalid })).toThrow();
    for (const invalid of [own, inherited, { ...shapeText(), unknown: { preset: "textPlain" } }])
      expect(() => normalizeShapeText(invalid)).toThrow();
    expect(reads).toBe(0);
  });

  test("ordinary shape/text-box admission remains separate from the old WordArt discriminator", () => {
    for (const kind of ["wordArt", "icon", "equation"] as const)
      expect(() => normalizeSheetDrawing({ ...warpedDrawing(), kind } as SheetDrawing)).toThrow();
    const legacy = { ...legacyShapeDrawing(), kind: "wordArt" as const };
    expect(normalizeSheetDrawing(legacy)).toEqual(legacy);
    expect(normalizeSheetDrawing(legacy)).not.toHaveProperty("shapeText");
  });

  test("warp-only legacy source owners reject source and placement getters before any property read", () => {
    let reads = 0;
    const drawing = {
      ...legacyShapeDrawing(),
      shapeText: { ...shapeText(), warp: { preset: "textPlain" as const } },
    };
    for (const key of ["kind", "text", "fontSize", "color", "height", "anchor"]) {
      const accessor = Object.defineProperty({ ...drawing }, key, {
        get() {
          reads++;
          return drawing[key as keyof typeof drawing];
        },
      });
      expect(() => normalizeSheetDrawing(accessor)).toThrow(/data field/);
    }
    const { text: _text, ...withoutText } = drawing;
    const inherited = Object.assign(
      Object.create({
        get text() {
          reads++;
          return "inherited";
        },
      }),
      withoutText,
    );
    expect(() => normalizeSheetDrawing(inherited)).toThrow(/own source data/);
    expect(() => normalizeSheetDrawing({ ...drawing, unknown: true } as SheetDrawing)).toThrow(
      /Unknown/,
    );
    expect(reads).toBe(0);
  });
});
