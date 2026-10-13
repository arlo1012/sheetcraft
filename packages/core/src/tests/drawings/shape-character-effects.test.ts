import { describe, expect, test } from "vitest";
import {
  SHAPE_TEXT_CHARACTER_LIMITS,
  SHAPE_TEXT_CHARACTER_PROPERTIES,
  areShapeTextCharacterRunsEqual,
  cloneShapeTextCharacterRuns,
  getShapeTextCharacterOverride,
  getShapeTextCharacterSegments,
  normalizeShapeTextCharacterFormat,
  normalizeShapeTextCharacterRuns,
  patchShapeTextCharacterRange,
  replaceShapeTextCharacterRange,
  stripShapeTextCharacterProperties,
} from "../../shape-text-character-runs.js";
import { normalizeShapeStyle } from "../../shape-style.js";
import { characterEffects } from "./shape-character-effects-fixture.js";

const keys = ["shadow", "reflection", "glow"] as const;

describe("sparse local glyph shadow, reflection and glow", () => {
  test("each category shares the uniform strict contract, canonical ordering and exact None semantics", () => {
    const input = characterEffects(),
      normalized = normalizeShapeTextCharacterFormat(input);
    expect(normalized).toEqual(normalizeShapeStyle(input));
    expect(normalized.shadow).toMatchObject({ value: { color: { rgb: "#AABBCC" }, angleDeg: 30 } });
    expect(Object.keys(normalized)).toEqual(keys);
    expect(SHAPE_TEXT_CHARACTER_PROPERTIES.slice(-3)).toEqual(keys);
    expect(normalizeShapeTextCharacterFormat({})).toEqual({});
    for (const key of keys) {
      const none = { [key]: { kind: "none" as const } };
      expect(normalizeShapeTextCharacterFormat(none)).toEqual(none);
      expect(areShapeTextCharacterRunsEqual("a", [{ start: 0, end: 1, ...none }], undefined)).toBe(
        false,
      );
      expect(
        getShapeTextCharacterSegments(
          { text: "ab", characterRuns: [{ start: 0, end: 1, ...none }] },
          input,
        ),
      ).toEqual([
        { start: 0, end: 1, ...normalized, ...none },
        { start: 1, end: 2, ...normalized },
      ]);
    }
    for (const kind of ["outer", "inner", "perspective"] as const) {
      const value = {
        ...input.shadow.value,
        kind,
        ...(kind === "perspective"
          ? { scaleX: -1, scaleY: 1.4, skewXDeg: 15, originX: 0.4, originY: 0.8 }
          : {}),
      };
      expect(normalizeShapeTextCharacterFormat({ shadow: { kind: "value", value } })).toEqual(
        normalizeShapeStyle({ shadow: { kind: "value", value } }),
      );
    }
  });

  test("canonical effect equality coalesces adjacent runs and every projection detaches nested payloads", () => {
    const input = characterEffects(),
      expected = normalizeShapeTextCharacterFormat(input),
      source = { text: "abcd", characterRuns: [{ start: 0, end: 2, bold: false, ...input }] };
    const combined = normalizeShapeTextCharacterRuns("abcd", [
      { start: 0, end: 2, ...input },
      { start: 2, end: 4, ...expected },
    ]);
    expect(combined).toEqual([{ start: 0, end: 4, ...expected }]);
    expect(areShapeTextCharacterRunsEqual("abcd", combined, [{ start: 0, end: 4, ...input }])).toBe(
      true,
    );
    const clone = cloneShapeTextCharacterRuns(source.text, source.characterRuns)!;
    for (const format of [
      clone[0]!,
      normalizeShapeTextCharacterFormat(input),
      getShapeTextCharacterOverride(source, 1),
      getShapeTextCharacterSegments(source)[0]!,
      patchShapeTextCharacterRange(source, 1, 3, { italic: true }).characterRuns![0]!,
      replaceShapeTextCharacterRange(source, 1, 1, "x").characterRuns![0]!,
    ]) {
      for (const key of keys) expect(format[key]).not.toBe(input[key]);
      if (
        format.shadow?.kind !== "value" ||
        format.reflection?.kind !== "value" ||
        format.glow?.kind !== "value"
      )
        throw Error("Expected authored effects");
      expect(format.shadow.value).not.toBe(input.shadow.value);
      expect(format.shadow.value.color).not.toBe(input.shadow.value.color);
      expect(format.glow.value.color).not.toBe(input.glow.value.color);
      format.shadow.value.opacity = 0;
      format.reflection.value.size = 0;
      format.glow.value.color = { kind: "automatic" };
    }
    expect(input).toEqual(characterEffects());
  });

  test("range edits, broadcasts and typing alter only named categories and retain explicit equal choices", () => {
    const effects = normalizeShapeTextCharacterFormat(characterEffects()),
      source = { text: "abcd", characterRuns: [{ start: 0, end: 4, bold: false, ...effects }] },
      none = { kind: "none" as const };
    const patched = patchShapeTextCharacterRange(source, 1, 3, { shadow: none });
    expect(patched.characterRuns).toEqual([
      { start: 0, end: 1, bold: false, ...effects },
      { start: 1, end: 3, bold: false, ...effects, shadow: none },
      { start: 3, end: 4, bold: false, ...effects },
    ]);
    expect(patchShapeTextCharacterRange(source, 0, 4, effects)).toEqual(source);
    const inherited = stripShapeTextCharacterProperties(source, ["shadow"]);
    expect(inherited.characterRuns).toEqual([
      { start: 0, end: 4, bold: false, reflection: effects.reflection, glow: effects.glow },
    ]);
    expect(stripShapeTextCharacterProperties(source, keys).characterRuns).toEqual([
      { start: 0, end: 4, bold: false },
    ]);
    expect(replaceShapeTextCharacterRange(patched, 2, 2, "x").characterRuns).toEqual([
      { start: 0, end: 1, bold: false, ...effects },
      { start: 1, end: 4, bold: false, ...effects, shadow: none },
      { start: 4, end: 5, bold: false, ...effects },
    ]);
    expect(replaceShapeTextCharacterRange(source, 1, 3, "x", {}).characterRuns).toEqual([
      { start: 0, end: 1, bold: false, ...effects },
      { start: 2, end: 3, bold: false, ...effects },
    ]);
    expect(() => patchShapeTextCharacterRange(source, 0, 1, { glow: none }, ["glow"])).toThrow();
  });

  test("strict own payloads reject accessors, inherited data, unknown leaves and unsupported run categories without reads", () => {
    let reads = 0;
    const getter = {
        get() {
          reads++;
          return 0.5;
        },
      },
      input = characterEffects();
    for (const key of keys) {
      const choice = input[key];
      for (const invalid of [
        undefined,
        null,
        {},
        [],
        { kind: "none", value: choice.value },
        { ...choice, extra: true },
        Object.assign(Object.create({ kind: "value" }), { value: choice.value }),
        Object.defineProperty({ ...choice }, "kind", getter),
        { kind: "value", value: Object.defineProperty({ ...choice.value }, "opacity", getter) },
        { kind: "value", value: { ...choice.value, extra: true } },
      ])
        expect(() => normalizeShapeTextCharacterFormat({ [key]: invalid })).toThrow();
      expect(() =>
        normalizeShapeTextCharacterFormat(Object.defineProperty({}, key, getter)),
      ).toThrow();
    }
    const invalidColors = [
      { kind: "rgb", rgb: "#abcde\ud800" },
      { kind: "rgb", rgb: "#abcdef", extra: true },
      Object.defineProperty({ kind: "rgb" }, "rgb", getter),
      { kind: "theme", reference: Object.defineProperty({ slot: "accent1" }, "tint", getter) },
      {
        kind: "theme",
        reference: Object.assign(
          Object.create({
            get slot() {
              reads++;
              return "accent1";
            },
          }),
          {},
        ),
      },
    ];
    for (const color of invalidColors)
      for (const key of ["shadow", "glow"] as const)
        expect(() =>
          normalizeShapeTextCharacterFormat({
            [key]: { kind: "value", value: { ...input[key].value, color } },
          }),
        ).toThrow();
    for (const key of ["softEdges", "format3d", "rotation3d", "style", "effects"])
      expect(() =>
        normalizeShapeTextCharacterRuns("a", [{ start: 0, end: 1, [key]: {} }]),
      ).toThrow();
    const runs = [{ start: 0, end: 1, ...input }];
    Object.defineProperty(runs, "0", getter);
    expect(() => normalizeShapeTextCharacterRuns("a", runs)).toThrow();
    expect(reads).toBe(0);
  });

  test("finite parameter bounds, grapheme edges and shared appearance budgets remain enforced", () => {
    const input = characterEffects();
    const parameterBounds = {
      shadow: {
        opacity: [0, 1],
        scale: [0, 16],
        blurPt: [0, 4096],
        distancePt: [0, 4096],
        angleDeg: [-3600, 3600],
      },
      reflection: { size: [0, 1], opacity: [0, 1], blurPt: [0, 4096], distancePt: [0, 4096] },
      glow: { opacity: [0, 1], sizePt: [0, 4096] },
    };
    for (const key of keys)
      for (const [parameter, [min, max]] of Object.entries(parameterBounds[key]))
        for (const invalid of [NaN, Infinity, -Infinity, min! - 0.01, max! + 0.01, "1"])
          expect(() =>
            normalizeShapeTextCharacterFormat({
              [key]: { kind: "value", value: { ...input[key].value, [parameter]: invalid } },
            }),
          ).toThrow();
    for (const content of ["A😀B", "Ae\u0301B", "A👩‍👩‍👧‍👦B"])
      expect(() =>
        normalizeShapeTextCharacterRuns(content, [{ start: 1, end: 2, ...input }]),
      ).toThrow(/grapheme/);
    expect(() => normalizeShapeTextCharacterFormat({ ...input, fontFamily: "bad\ud800" })).toThrow(
      /surrogates/,
    );
    for (const key of keys)
      expect(() =>
        normalizeShapeTextCharacterFormat({
          [key]: {
            kind: "value",
            value: { oversized: "x".repeat(SHAPE_TEXT_CHARACTER_LIMITS.workUnits) },
          },
        }),
      ).toThrow(/work budget/);
    expect(() =>
      normalizeShapeTextCharacterRuns(
        "x".repeat(20000),
        Array.from({ length: 20000 }, (_, start) => ({ start, end: start + 1, ...input })),
      ),
    ).toThrow(/work budget/);
  });
});
