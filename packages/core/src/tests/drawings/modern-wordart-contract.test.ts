import { describe, expect, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  normalizeSheetDrawing,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
} from "../../sheet-drawings.js";
import { cloneShapeRootsForClipboard } from "../../shape-group-copy.js";
import {
  collectShapeGroupAssetIds,
  normalizeShapeGroup,
  type ShapeGroupDrawing,
} from "../../shape-group.js";
import {
  getShapeTextCharacterOverride,
  getShapeTextCharacterSegments,
  normalizeShapeTextCharacterFormat,
  normalizeShapeTextCharacterRuns,
  patchShapeTextCharacterRange,
  replaceShapeTextCharacterRange,
  stripShapeTextCharacterProperties,
  SHAPE_TEXT_CHARACTER_LIMITS,
  SHAPE_TEXT_CHARACTER_PROPERTIES,
  type ShapeTextCharacterFormat,
} from "../../shape-text-character-runs.js";
import { getShapeTextAssetIds } from "../../shape-text.js";
import { normalizeShapeStyle } from "../../shape-style.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import { createSheetSparseState, getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { gradient, line, picturePaint } from "../images/detailed-style-fixture.js";
import { group, localFrame, nested } from "../shape-groups/fixtures.js";
import { freePath } from "./free-path-fixture.js";
import { legacyShapeDrawing } from "./shape-style-fixture.js";
import { shapeText } from "./shape-text-fixture.js";

function wordArt(): SheetFramedGraphicDrawing {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _w,
    height: _h,
    ...appearance
  } = legacyShapeDrawing();
  return {
    ...appearance,
    kind: "shape",
    wordArt: true,
    text: "alpha beta",
    shapeGeometry: { preset: "rect" },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 10, y: 20, size: { width: 200, height: 100 } },
    },
    shapeText: shapeText(),
  };
}
function appearance(): ShapeTextCharacterFormat {
  return {
    fill: { kind: "value", value: gradient() },
    line: { kind: "value", value: line(picturePaint("outline")) },
  };
}
function tree(): ShapeGroupDrawing {
  const { shapeFrame: _frame, ...owned } = wordArt();
  return {
    ...group(),
    members: [{ ...nested(), members: [{ ...owned, groupFrame: localFrame() }] }],
  };
}
function deepLeaf(value: ShapeGroupDrawing) {
  const owner = value.members[0]!;
  if (owner.kind !== "shapeGroup") throw Error("Expected inner owner");
  const child = owner.members[0]!;
  if (child.kind !== "shape" && child.kind !== "textBox") throw Error("Expected leaf");
  return child;
}

describe("modern WordArt and local glyph appearance contract", () => {
  test("canonical shape semantic tag survives root and deep ownership normalization", () => {
    expect(normalizeSheetDrawing(wordArt())).toEqual(wordArt());
    expect(normalizeShapeGroup(tree())).toEqual(tree());
    expect(normalizeSheetDrawing({ ...wordArt(), text: "" })).toHaveProperty("wordArt", true);
    const { wordArt: _tag, ...ordinary } = wordArt();
    expect(normalizeSheetDrawing(ordinary)).not.toHaveProperty("wordArt");
  });

  test("tag is true-only, ordinary text-bearing shape-only and descriptor-safe", () => {
    const { shapeText: _text, ...withoutText } = wordArt();
    const { shapeGeometry: _geometry, ...noGeometry } = wordArt();
    for (const invalid of [
      ...[false, undefined, null, 1, "true"].map((tag) => ({ ...wordArt(), wordArt: tag })),
      { ...wordArt(), kind: "textBox" },
      withoutText,
      { ...wordArt(), shapeGeometry: { preset: "line" } },
      { ...noGeometry, shape: "line" },
      { ...noGeometry, shapePath: freePath() },
      { ...group(), wordArt: true },
    ])
      expect(() => normalizeSheetDrawing(invalid as SheetDrawing)).toThrow();
    expect(
      normalizeSheetDrawing({ ...legacyShapeDrawing(), wordArt: true, shapeText: shapeText() }),
    ).toHaveProperty("wordArt", true);
    let reads = 0;
    const own = Object.defineProperty(wordArt(), "wordArt", {
      get() {
        reads++;
        return true;
      },
    });
    const { wordArt: _tag, ...untagged } = noGeometry;
    const inherited = Object.assign(
      Object.create({
        get wordArt() {
          reads++;
          return true;
        },
      }),
      untagged,
    );
    expect(() => normalizeSheetDrawing(own)).toThrow();
    expect(() => normalizeSheetDrawing(inherited)).toThrow();
    const nestedGetter = tree();
    Object.defineProperty(deepLeaf(nestedGetter), "wordArt", {
      get() {
        reads++;
        return true;
      },
    });
    expect(() => normalizeShapeGroup(nestedGetter)).toThrow();
    expect(reads).toBe(0);
    const retained = { ...freePath(), openArea: true as const };
    expect(normalizeSheetDrawing({ ...noGeometry, shapePath: retained })).toHaveProperty(
      "wordArt",
      true,
    );
  });

  test("run fill and outline reuse strict Shape normalization, retain None and detach trees", () => {
    const raw = appearance();
    const normalized = normalizeShapeTextCharacterFormat(raw);
    expect(normalized).toEqual(normalizeShapeStyle(raw));
    expect(normalized.fill).not.toBe(raw.fill);
    expect(normalized.line).not.toBe(raw.line);
    expect(
      normalizeShapeTextCharacterFormat({
        fill: { kind: "none" },
        line: { kind: "none" },
        color: "#ABCDEF",
      }),
    ).toEqual({ color: "#abcdef", fill: { kind: "none" }, line: { kind: "none" } });
    for (const invalid of [
      { fill: undefined },
      { line: undefined },
      { softEdges: { kind: "none" } },
      { fill: { kind: "value", value: { ...gradient(), unknown: true } } },
      { line: { kind: "value", value: { ...line(), widthPt: Infinity } } },
      { fill: { kind: "inherit" } },
    ])
      expect(() => normalizeShapeTextCharacterFormat(invalid)).toThrow();
    let reads = 0;
    const fill = Object.defineProperty({}, "kind", {
      get() {
        reads++;
        return "none";
      },
    });
    expect(() => normalizeShapeTextCharacterFormat({ fill })).toThrow();
    expect(reads).toBe(0);
  });

  test("equal deep appearance coalesces; range patch, splice, inheritance and strip preserve local ownership", () => {
    const runs = normalizeShapeTextCharacterRuns("alpha beta", [
      { start: 0, end: 3, ...appearance() },
      { start: 3, end: 6, ...appearance() },
    ])!;
    expect(runs).toHaveLength(1);
    const source = { text: "alpha beta", characterRuns: runs };
    const changed = patchShapeTextCharacterRange(source, 2, 8, { line: { kind: "none" } });
    expect(changed.characterRuns).toHaveLength(3);
    expect(getShapeTextCharacterOverride(changed, 4)).toMatchObject({
      fill: appearance().fill,
      line: { kind: "none" },
    });
    const typed = replaceShapeTextCharacterRange(source, 3, 3, "X");
    expect(typed.characterRuns).toEqual([
      { start: 0, end: 7, ...normalizeShapeTextCharacterFormat(appearance()) },
    ]);
    const inherited = patchShapeTextCharacterRange(source, 0, 6, {}, ["fill", "line"]);
    expect(inherited).toEqual({ text: source.text });
    expect(stripShapeTextCharacterProperties(source, SHAPE_TEXT_CHARACTER_PROPERTIES)).toEqual({
      text: source.text,
    });
    const segments = getShapeTextCharacterSegments(source, { line: { kind: "none" } });
    expect(segments[0]!.fill).not.toBe(runs[0]!.fill);
    expect(segments[1]!.line).toEqual({ kind: "none" });
  });

  test("complex paints count against the same aggregate bounded normalization and mutation budget", () => {
    const length = 8000,
      text = "a".repeat(length);
    const paint = gradient();
    paint.stops = Array.from({ length: 16 }, (_, index) => ({
      ...paint.stops[0]!,
      offset: index / 15,
    }));
    const runs = Array.from({ length }, (_, start) => ({
      start,
      end: start + 1,
      bold: start % 2 === 0,
      fill: { kind: "value" as const, value: paint },
    }));
    expect(() => normalizeShapeTextCharacterRuns(text, runs)).toThrow(/work budget/);
    expect(() =>
      patchShapeTextCharacterRange(
        { text, characterRuns: runs.map(({ fill: _fill, ...run }) => run) },
        0,
        length,
        { fill: { kind: "value", value: paint } },
      ),
    ).toThrow(/work budget/);
    expect(SHAPE_TEXT_CHARACTER_LIMITS.workUnits).toBe(2000000);
  });

  test("explicit local fill removes only inherited editor color while authored color stays strongest", () => {
    const source = { text: "alpha beta", characterRuns: [{ start: 0, end: 6, ...appearance() }] };
    const segments = getShapeTextCharacterSegments(source, { color: "#123456", bold: true });
    expect(segments[0]).not.toHaveProperty("color");
    expect(segments[0]).toHaveProperty(
      "fill",
      normalizeShapeTextCharacterFormat(appearance()).fill,
    );
    expect(segments[0]).toHaveProperty("bold", true);
    expect(segments[1]).toHaveProperty("color", "#123456");
    const strong = getShapeTextCharacterSegments(
      { ...source, characterRuns: [{ ...source.characterRuns[0]!, color: "#ABCDEF" }] },
      { color: "#123456" },
    );
    expect(strong[0]).toHaveProperty("color", "#abcdef");
    expect(strong[0]).toHaveProperty("fill");
    const none = getShapeTextCharacterSegments(
      { text: "a", characterRuns: [{ start: 0, end: 1, fill: { kind: "none" } }] },
      { color: "#123456" },
    );
    expect(none[0]).not.toHaveProperty("color");
  });

  test("conditional V70 roundtrips root, deep leaf and run-only semantics without changing old inference", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const runOnly = {
      ...legacyShapeDrawing(),
      text: "alpha beta",
      shapeText: { ...shapeText(), characterRuns: [{ start: 0, end: 6, ...appearance() }] },
    };
    for (const drawing of [wordArt(), tree(), runOnly]) {
      sheet.drawings = [drawing];
      const snapshot = serializeWorkbook(session.workbook);
      expect(snapshot.version).toBe(70);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(
        serializeSheet(sheet),
      );
    }
    const { wordArt: _tag, ...plain } = wordArt();
    sheet.drawings = [plain];
    expect(serializeWorkbook(session.workbook).version).toBe(60);
    sheet.drawings = [{ ...legacyShapeDrawing(), kind: "wordArt" }];
    const legacy = serializeWorkbook(session.workbook);
    expect(legacy.version).toBe(43);
    expect(serializeWorkbook(deserializeWorkbook(legacy))).toEqual(legacy);
    sheet.drawings = [
      {
        ...runOnly,
        shapeText: { ...shapeText(), characterRuns: [{ start: 0, end: 1, bold: false }] },
      },
    ];
    expect(serializeWorkbook(session.workbook).version).toBe(66);
  });

  test("V66..69 rejects raw tag/fill/outline markers before accessors and malformed markers are never dropped", () => {
    const base = serializeWorkbook(createTestWorkbookSession().workbook);
    let reads = 0;
    const tagGetter = Object.defineProperty(wordArt(), "wordArt", {
      get() {
        reads++;
        return true;
      },
    });
    const getterRun = Object.defineProperty({ start: 0, end: 1 }, "fill", {
      get() {
        reads++;
        return { kind: "none" };
      },
    });
    const inheritedRun = Object.assign(
      Object.create({
        get line() {
          reads++;
          return { kind: "none" };
        },
      }),
      { start: 0, end: 1 },
    );
    const runOwner = (run: unknown) => ({
      ...legacyShapeDrawing(),
      shapeText: { ...shapeText(), characterRuns: [run] },
    });
    for (const drawing of [
      wordArt(),
      tree(),
      tagGetter,
      { ...wordArt(), wordArt: undefined },
      runOwner(getterRun),
      runOwner(inheritedRun),
      runOwner({ start: 0, end: 1, fill: undefined }),
    ]) {
      for (let version = 66; version <= 69; version++)
        expect(() =>
          deserializeWorkbook({
            ...base,
            version,
            sheets: [{ ...base.sheets[0]!, drawings: [drawing] }],
          }),
        ).toThrow(/version 70/);
    }
    expect(reads).toBe(0);
    expect(() =>
      deserializeWorkbook({
        ...base,
        version: 70,
        sheets: [{ ...base.sheets[0]!, drawings: [runOwner(getterRun)] }],
      }),
    ).toThrow();
    expect(reads).toBe(0);
  });

  test("root and nested assets, history, sparse restore and object clipboard detach local appearances", () => {
    const drawing = tree(),
      target = deepLeaf(drawing);
    target.shapeText!.characterRuns = [
      {
        start: 0,
        end: 6,
        fill: { kind: "value", value: picturePaint("fill") },
        line: appearance().line,
      },
    ];
    expect(getShapeTextAssetIds(target.shapeText, target.text)).toEqual(["fill", "outline"]);
    expect([...collectShapeGroupAssetIds(drawing)]).toEqual(["fill", "outline"]);
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const before = serializeWorkbook(session.workbook),
      command = createSetSheetDrawingsCommand(sheet.id, [drawing]);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    let id = 0;
    const copied = cloneShapeRootsForClipboard(sheet.drawings!, {
      createId: () => `copy-${++id}`,
    })[0] as ShapeGroupDrawing;
    const copiedRun = deepLeaf(copied).shapeText!.characterRuns![0]!;
    expect(copiedRun.fill).not.toBe(
      deepLeaf(sheet.drawings![0] as ShapeGroupDrawing).shapeText!.characterRuns![0]!.fill,
    );
    if (copiedRun.fill?.kind === "value" && copiedRun.fill.value.kind === "picture")
      copiedRun.fill.value.assetId = "changed";
    const sparse = createSheetSparseState(sheet);
    expect(
      deepLeaf(sparse.drawings![0] as ShapeGroupDrawing).shapeText!.characterRuns![0]!.line,
    ).not.toBe(
      deepLeaf(sheet.drawings![0] as ShapeGroupDrawing).shapeText!.characterRuns![0]!.line,
    );
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    const { wordArt: _tag, ...plain } = deepLeaf(drawing);
    const withoutTag = { ...drawing, members: [{ ...nested(), members: [plain] }] };
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [withoutTag])),
    ).toBe(true);
  });
});
