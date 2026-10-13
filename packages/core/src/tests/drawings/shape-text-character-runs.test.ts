import { describe, expect, test } from "vitest";
import {
  SHAPE_TEXT_CHARACTER_LIMITS,
  areShapeTextCharacterRunsEqual,
  getShapeTextCharacterOverride,
  getShapeTextCharacterSegments,
  isShapeTextCharacterBoundary,
  normalizeShapeTextCharacterFormat,
  normalizeShapeTextCharacterRuns,
  patchShapeTextCharacterRange,
  replaceShapeTextCharacterRange,
  stripShapeTextCharacterProperties,
  type ShapeTextCharacterRun,
} from "../../shape-text-character-runs.js";
import { cloneShapeText, normalizeShapeText } from "../../shape-text.js";
import { normalizeSheetDrawing } from "../../sheet-drawings.js";
import { shapeText, textDrawing } from "./shape-text-fixture.js";

const rich = {
  fontFamily: "Exact 😀",
  fontSize: 20.5,
  bold: false,
  italic: true,
  underline: false,
  strike: true,
  color: "#abcdef",
};
const source = () => ({ text: "alpha beta", characterRuns: [{ start: 0, end: 6, ...rich }] });

describe("shape-owned sparse character formatting", () => {
  test("canonical fields, explicit false/equal values, empty patches and contiguous equal records", () => {
    const input = [
      { end: 2, start: 0, color: "#ABCDEF", bold: false },
      { start: 2, end: 4, bold: false, color: "#abcdef" },
      { start: 4, end: 5 },
    ];
    expect(normalizeShapeTextCharacterRuns("abcde", input)).toEqual([
      { start: 0, end: 4, bold: false, color: "#abcdef" },
    ]);
    expect(normalizeShapeTextCharacterRuns("abc", [])).toBeUndefined();
    expect(normalizeShapeTextCharacterFormat(rich)).toEqual(rich);
    expect(normalizeShapeTextCharacterFormat({ color: "TRANSPARENT" })).toEqual({
      color: "transparent",
    });
    const segments = getShapeTextCharacterSegments(source(), { fontSize: 20.5, bold: true });
    expect(segments).toEqual([
      { start: 0, end: 6, ...rich },
      { start: 6, end: 10, fontSize: 20.5, bold: true },
    ]);
    expect(getShapeTextCharacterSegments({ text: "" }, { color: "#abcdef" })).toEqual([]);
    expect(
      areShapeTextCharacterRunsEqual("abcde", input, [
        { start: 0, end: 4, bold: false, color: "#abcdef" },
      ]),
    ).toBe(true);
    const adjacent = normalizeShapeTextCharacterRuns("ab", [
      { start: 0, end: 1, bold: false },
      { start: 1, end: 2, fontSize: 11 },
    ])!;
    expect(adjacent).toHaveLength(2);
  });

  test("context-aware shape normalization uses actual text and detached arrays/records", () => {
    const model = { ...shapeText(), characterRuns: source().characterRuns };
    expect(() => normalizeShapeText(model)).toThrow(/actual drawing text/);
    const clone = cloneShapeText(model, source().text)!;
    expect(clone).toEqual(model);
    expect(clone.characterRuns).not.toBe(model.characterRuns);
    expect(clone.characterRuns![0]).not.toBe(model.characterRuns[0]);
    expect(normalizeSheetDrawing({ ...textDrawing(model), text: source().text })).toMatchObject({
      shapeText: model,
    });
    expect(() => normalizeSheetDrawing({ ...textDrawing(model), text: "x" })).toThrow();
    expect(normalizeShapeText({ ...shapeText(), characterRuns: [] }, "")).toEqual(shapeText());
    expect(() => normalizeShapeText({ ...shapeText(), characterRuns: undefined }, "")).toThrow();
    expect(normalizeShapeText(shapeText())).toEqual(shapeText());
  });

  test("ranges require exact grapheme boundaries, ordered nonoverlap and bounded integers", () => {
    for (const text of ["A😀B", "Ae\u0301B", "A🇨🇳B", "A👍🏽B", "A👩‍👩‍👧‍👦B", "A\r\nB"])
      for (let offset = 2; offset < text.length - 1; offset++) {
        expect(isShapeTextCharacterBoundary(text, offset)).toBe(false);
        expect(() =>
          normalizeShapeTextCharacterRuns(text, [{ start: 0, end: offset, bold: true }]),
        ).toThrow();
        expect(() => patchShapeTextCharacterRange({ text }, 1, offset, { bold: true })).toThrow();
      }
    for (const input of [
      [{ start: 0, end: 0, bold: true }],
      [{ start: -1, end: 1, bold: true }],
      [{ start: 0, end: 5, bold: true }],
      [{ start: 0.5, end: 1, bold: true }],
      [{ start: 0, end: Infinity, bold: true }],
      [
        { start: 2, end: 3, bold: true },
        { start: 0, end: 1, bold: true },
      ],
      [
        { start: 0, end: 2, bold: true },
        { start: 1, end: 3, bold: true },
      ],
    ])
      expect(() => normalizeShapeTextCharacterRuns("abcd", input)).toThrow();
    expect(() =>
      normalizeShapeTextCharacterRuns("x".repeat(SHAPE_TEXT_CHARACTER_LIMITS.textUnits + 1), []),
    ).toThrow(/budget/);
    expect(() =>
      normalizeShapeTextCharacterRuns(
        "a",
        Array.from({ length: SHAPE_TEXT_CHARACTER_LIMITS.runs + 1 }, () => undefined),
      ),
    ).toThrow(/budget/);
  });

  test("unknown, inherited, accessor, sparse, symbol, cyclic and nonfinite payloads never repair or execute", () => {
    let reads = 0;
    const accessor = Object.defineProperty({ start: 0, end: 1 }, "bold", {
      get() {
        reads++;
        return true;
      },
    });
    const entries = Object.defineProperty([], "0", {
      get() {
        reads++;
        return accessor;
      },
    });
    const sparseArray: unknown[] = [];
    sparseArray.length = 1;
    const inherited = Object.assign(Object.create({ bold: true }), { start: 0, end: 1 });
    const cyclic: Record<string, unknown> = { start: 0, end: 1 };
    cyclic.bold = cyclic;
    for (const input of [
      [accessor],
      entries,
      [inherited],
      [cyclic],
      [null],
      [[1]],
      sparseArray,
      [{ start: 0, end: 1, text: "a" }],
      [{ start: 0, end: 1, [Symbol("x")]: true }],
      Object.assign([], { extra: true }),
      Object.assign(Object.create([]), { length: 1, 0: {} }),
    ])
      expect(() => normalizeShapeTextCharacterRuns("a", input)).toThrow();
    expect(reads).toBe(0);
    for (const format of [
      { fontFamily: "" },
      { fontFamily: " x" },
      { fontFamily: "x\n" },
      { fontFamily: "\ud800" },
      { fontFamily: "a".repeat(257) },
      { fontSize: NaN },
      { fontSize: Infinity },
      { fontSize: 0.9 },
      { fontSize: 512.1 },
      { color: "red" },
      { color: "#abc" },
      { bold: 1 },
      { underline: undefined },
    ])
      expect(() => normalizeShapeTextCharacterFormat(format)).toThrow();
    const drawing = {
      ...textDrawing({ ...shapeText(), characterRuns: [{ start: 0, end: 1, bold: false }] }),
      text: "a",
    };
    Object.defineProperty(drawing, "text", {
      get() {
        reads++;
        return "a";
      },
    });
    expect(() => normalizeSheetDrawing(drawing)).toThrow();
    expect(reads).toBe(0);
  });

  test("selected patches split exactly, preserve unrelated properties, inherit only named properties", () => {
    const original = source();
    const changed = patchShapeTextCharacterRange(original, 2, 8, { fontSize: 32, bold: true });
    expect(changed.text).toBe(original.text);
    expect(changed.characterRuns).toEqual([
      { start: 0, end: 2, ...rich },
      { start: 2, end: 6, ...rich, fontSize: 32, bold: true },
      { start: 6, end: 8, fontSize: 32, bold: true },
    ]);
    expect(
      Object.keys(
        patchShapeTextCharacterRange(
          { text: "a", characterRuns: [{ start: 0, end: 1, bold: false }] },
          0,
          1,
          { fontFamily: "Exact", fontSize: 11 },
        ).characterRuns![0]!,
      ),
    ).toEqual(["start", "end", "fontFamily", "fontSize", "bold"]);
    expect(original).toEqual(source());
    expect(
      patchShapeTextCharacterRange(changed, 2, 8, {}, ["bold", "fontSize"]).characterRuns,
    ).toEqual([
      { start: 0, end: 2, ...rich },
      {
        start: 2,
        end: 6,
        fontFamily: rich.fontFamily,
        italic: true,
        underline: false,
        strike: true,
        color: rich.color,
      },
    ]);
    expect(stripShapeTextCharacterProperties(original, ["fontSize"]).characterRuns).toEqual([
      {
        start: 0,
        end: 6,
        fontFamily: rich.fontFamily,
        bold: false,
        italic: true,
        underline: false,
        strike: true,
        color: rich.color,
      },
    ]);
    expect(
      stripShapeTextCharacterProperties(original, Object.keys(rich) as (keyof typeof rich)[]),
    ).toEqual({ text: original.text });
    expect(() => patchShapeTextCharacterRange(original, 0, 1, { bold: true }, ["bold"])).toThrow();
    expect(patchShapeTextCharacterRange(original, 3, 3, { bold: true })).toEqual(original);
  });

  test("caret affinity and exact repeated-text replacement are explicit", () => {
    const original = source();
    expect(getShapeTextCharacterOverride(original, 0)).toEqual(rich);
    expect(getShapeTextCharacterOverride(original, 6, "backward")).toEqual(rich);
    expect(getShapeTextCharacterOverride(original, 6, "forward")).toEqual({});
    expect(getShapeTextCharacterOverride(original, 10)).toEqual({});
    expect(replaceShapeTextCharacterRange(original, 5, 5, "x")).toEqual({
      text: "alphax beta",
      characterRuns: [{ start: 0, end: 7, ...rich }],
      caret: 6,
    });
    expect(replaceShapeTextCharacterRange(original, 10, 10, "y")).toEqual({
      text: "alpha betay",
      characterRuns: original.characterRuns,
      caret: 11,
    });
    expect(replaceShapeTextCharacterRange(original, 2, 8, "Q", {})).toEqual({
      text: "alQta",
      characterRuns: [{ start: 0, end: 2, ...rich }],
      caret: 3,
    });
    const repeated = {
      text: "aaaa",
      characterRuns: [
        { start: 0, end: 1, bold: true },
        { start: 2, end: 3, italic: true },
      ],
    };
    expect(
      replaceShapeTextCharacterRange(repeated, 1, 2, "a", { underline: true }).characterRuns,
    ).toEqual([
      { start: 0, end: 1, bold: true },
      { start: 1, end: 2, underline: true },
      { start: 2, end: 3, italic: true },
    ]);
  });

  test("splice resegments combining, ZWJ and regional-indicator joins with declared cluster affinity", () => {
    expect(
      replaceShapeTextCharacterRange(
        { text: "ab", characterRuns: [{ start: 0, end: 1, bold: true }] },
        1,
        1,
        "\u0301",
        {},
      ),
    ).toEqual({ text: "a\u0301b", caret: 2 });
    expect(
      replaceShapeTextCharacterRange({ text: "ab" }, 1, 1, "\u0301", { italic: true }),
    ).toEqual({ text: "a\u0301b", characterRuns: [{ start: 0, end: 2, italic: true }], caret: 2 });
    expect(
      replaceShapeTextCharacterRange(
        {
          text: "aX\u0301b",
          characterRuns: [
            { start: 0, end: 1, bold: true },
            { start: 1, end: 3, italic: true },
          ],
        },
        1,
        3,
        "",
      ),
    ).toEqual({ text: "ab", characterRuns: [{ start: 0, end: 1, bold: true }], caret: 1 });
    const joined = replaceShapeTextCharacterRange(
      {
        text: "👩👩",
        characterRuns: [
          { start: 0, end: 2, bold: true },
          { start: 2, end: 4, italic: true },
        ],
      },
      2,
      2,
      "\u200d",
      { underline: true },
    );
    expect(joined).toEqual({
      text: "👩‍👩",
      characterRuns: [{ start: 0, end: 5, underline: true }],
      caret: 5,
    });
    const deleted = replaceShapeTextCharacterRange(
      {
        text: "🇦X🇧",
        characterRuns: [
          { start: 0, end: 2, bold: false },
          { start: 3, end: 5, italic: true },
        ],
      },
      2,
      3,
      "",
    );
    expect(deleted).toEqual({
      text: "🇦🇧",
      characterRuns: [{ start: 0, end: 4, bold: false }],
      caret: 4,
    });
  });

  test("regional-indicator insertion reconciles re-pairing beyond the insertion cluster", () => {
    const original = {
      text: "🇦🇧🇨🇩",
      characterRuns: [
        { start: 0, end: 4, bold: true },
        { start: 4, end: 8, italic: true },
      ],
    };
    expect(replaceShapeTextCharacterRange(original, 0, 0, "🇪", {})).toEqual({
      text: "🇪🇦🇧🇨🇩",
      caret: 4,
      characterRuns: [
        { start: 4, end: 8, bold: true },
        { start: 8, end: 10, italic: true },
      ],
    });
  });

  test("normalization and trusted mutations share a bounded format-work budget", () => {
    const length = 8000,
      content = "a".repeat(length),
      family = "f".repeat(256);
    const excessive = Array.from({ length }, (_, index) => ({
      start: index,
      end: index + 1,
      fontFamily: family,
      bold: index % 2 === 0,
    }));
    expect(() => normalizeShapeTextCharacterRuns(content, excessive)).toThrow(/work budget/);
    const sparse = excessive.map(({ fontFamily: _family, ...run }) => run);
    expect(() =>
      patchShapeTextCharacterRange({ text: content, characterRuns: sparse }, 0, length, {
        fontFamily: family,
      }),
    ).toThrow(/work budget/);
  });

  test("missing full segmentation affects only the new feature", () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, "Segmenter")!;
    Object.defineProperty(Intl, "Segmenter", { ...descriptor, value: undefined });
    try {
      expect(normalizeShapeText(shapeText())).toEqual(shapeText());
      expect(() =>
        normalizeShapeTextCharacterRuns("a", [{ start: 0, end: 1, bold: true }]),
      ).toThrow(/segmentation/);
    } finally {
      Object.defineProperty(Intl, "Segmenter", descriptor);
    }
  });

  test("bounded helpers handle maximally alternating formats without quadratic range scans", () => {
    const length = 2000,
      content = "a".repeat(length);
    const runs: ShapeTextCharacterRun[] = Array.from({ length }, (_, index) => ({
      start: index,
      end: index + 1,
      bold: index % 2 === 0,
    }));
    expect(
      patchShapeTextCharacterRange({ text: content, characterRuns: runs }, 0, length, {
        fontSize: 11,
      }).characterRuns,
    ).toHaveLength(length);
    expect(
      stripShapeTextCharacterProperties({ text: content, characterRuns: runs }, ["bold"]),
    ).toEqual({ text: content });
  });
});
