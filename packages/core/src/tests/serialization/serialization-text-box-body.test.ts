import { describe, expect, expectTypeOf, test } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV73,
} from "../../serialization.js";
import {
  normalizeSheetDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
} from "../../sheet-drawings.js";
import {
  MAX_SHAPE_GROUP_DEPTH,
  MAX_SHAPE_GROUP_NODES,
  traverseShapeGroup,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
} from "../../shape-group.js";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import { fullStyle } from "../images/detailed-style-fixture.js";
import { group, leaf, nested } from "../shape-groups/fixtures.js";
import { framedShapeDrawing } from "../drawings/shape-frame-fixture.js";
import { shapeText } from "../drawings/shape-text-fixture.js";
import { legacyShapeDrawing, textureShapeStyle } from "../drawings/shape-style-fixture.js";

const BODY_CATEGORIES = ["fill", "line", "shadow", "reflection", "glow", "softEdges"] as const;
function textBox(): SheetGraphicDrawing {
  return {
    ...legacyShapeDrawing(),
    kind: "textBox",
    shapeStyle: fullStyle(),
    shapeText: { ...shapeText(), style: textureShapeStyle("glyph-fill", "glyph-line") },
  };
}
function owned(style: unknown = fullStyle()): ShapeGroupDrawing {
  return {
    ...group("body-root"),
    members: [
      {
        ...nested("body-inner"),
        members: [
          {
            ...leaf("body-text", "textBox"),
            shapeStyle: style as SheetGraphicDrawing["shapeStyle"],
            shapeText: shapeText(),
          },
        ],
      },
    ],
  };
}
function target(drawing: SheetDrawing) {
  if (drawing.kind !== "shapeGroup") return drawing as SheetGraphicDrawing;
  const result = traverseShapeGroup(drawing).find(({ node }) => node.kind === "textBox")!.node;
  if (result.kind === "shapeGroup") throw Error("Expected text box");
  return result;
}
function emptySnapshot() {
  return serializeWorkbook(createWorkbook({ id: "body-workbook", sheetId: "body-sheet" }));
}
function rawSnapshot(drawing: unknown, version = 73) {
  const base = emptySnapshot();
  return { ...base, version, sheets: [{ ...base.sheets[0]!, drawings: [drawing] }] };
}

describe("conditional internal V73 TextBox body snapshots", () => {
  test("root, canonical and deeply owned rich body styles select73 and roundtrip detached", () => {
    expectTypeOf<WorkbookSnapshotV73>().toExtend<WorkbookSnapshot>();
    for (const drawing of [
      textBox(),
      { ...framedShapeDrawing(), kind: "textBox" as const, shapeStyle: fullStyle() },
      owned(),
    ]) {
      const workbook = createWorkbook({ id: "body-workbook", sheetId: "body-sheet" }),
        sheet = getActiveSheet(workbook);
      sheet.drawings = [drawing];
      const before = serializeWorkbook(workbook);
      expect(before.version).toBe(73);
      expect(serializeWorkbook(deserializeWorkbook(before))).toEqual(before);
      const standalone = serializeSheet(sheet);
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
      const saved = target(before.sheets[0]!.drawings![0]!);
      expect(saved.shapeStyle).not.toBe(target(drawing).shapeStyle);
      expect(saved.shapeStyle!.fill).not.toBe(target(drawing).shapeStyle!.fill);
      expect(saved.shapeText).not.toBe(target(drawing).shapeText);
      saved.shapeStyle!.fill = { kind: "none" };
      saved.shapeText!.layout.marginsPt.leftPt = 123;
      expect(target(drawing).shapeStyle!.fill!.kind).toBe("value");
      expect(target(drawing).shapeText!.layout.marginsPt.leftPt).toBe(7.2);
    }
  });

  test("each sparse value or explicit None selects73, and mixed earlier features cannot lower it", () => {
    for (const category of BODY_CATEGORIES)
      for (const choice of [fullStyle()[category], { kind: "none" as const }])
        for (const isOwned of [false, true]) {
          const style = { [category]: choice };
          const drawing = isOwned ? owned(style) : { ...textBox(), shapeStyle: style };
          const workbook = deserializeWorkbook(rawSnapshot(drawing));
          const snapshot = serializeWorkbook(workbook);
          expect(snapshot.version).toBe(73);
          expect(snapshot.sheets[0]!.drawings).toEqual([drawing]);
          const standalone = rawSnapshot(drawing).sheets[0]!;
          expect(serializeSheet(deserializeSheet(standalone)).drawings).toEqual([drawing]);
        }
    const mixed = textBox();
    mixed.hidden = true;
    mixed.shapeFlipX = true;
    mixed.shapeText!.warp = { preset: "textPlain" };
    mixed.shapeText!.characterRuns = [
      { start: 0, end: 1, fill: { kind: "none" }, glow: { kind: "none" } },
    ];
    const tree = owned({ fill: { kind: "none" } });
    tree.group3d = { rotation3d: { kind: "none" } };
    tree.groupEffects = {
      shadow: { kind: "none" },
      reflection: { kind: "none" },
      glow: { kind: "none" },
    };
    for (const drawings of [
      [mixed, tree],
      [tree, mixed],
    ]) {
      const workbook = createWorkbook({ id: "mixed", sheetId: "sheet" }),
        sheet = getActiveSheet(workbook);
      sheet.drawings = drawings;
      const snapshot = serializeWorkbook(workbook);
      expect(snapshot.version).toBe(73);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(
        serializeSheet(sheet),
      );
      delete mixed.shapeStyle;
      delete target(tree).shapeStyle;
      expect(serializeWorkbook(workbook).version).toBe(72);
      mixed.shapeStyle = fullStyle();
      target(tree).shapeStyle = { fill: { kind: "none" } };
    }
  });

  test("all <=72 advertised protocols reject non-3D category presence before malformed or inherited getters", () => {
    let reads = 0;
    const getter = {
      get() {
        reads++;
        throw Error("Getter executed");
      },
      enumerable: true,
    };
    for (const category of BODY_CATEGORIES)
      for (const style of [
        { [category]: fullStyle()[category] },
        { [category]: { kind: "none" } },
        { [category]: undefined },
        { [category]: null },
        { [category]: {} },
        Object.defineProperty({}, category, getter),
        Object.create(Object.defineProperty({}, category, getter)),
      ])
        for (const isOwned of [false, true]) {
          const drawing = isOwned ? owned(style) : { ...textBox(), shapeStyle: style };
          for (let version = 1; version <= 72; version++) {
            const assertion = expect(() => deserializeWorkbook(rawSnapshot(drawing, version)));
            if (version >= 25) assertion.toThrow(/version 73/);
            else assertion.toThrow();
          }
        }
    expect(reads).toBe(0);
  });

  test("V73 and standalone reject absent explicit text, malformed choices, spoofed owners and getters", () => {
    let reads = 0;
    const getter = {
      get() {
        reads++;
        throw Error("Getter executed");
      },
      enumerable: true,
    };
    for (const isOwned of [false, true]) {
      for (const style of [
        undefined,
        {},
        null,
        { fill: undefined },
        { line: { kind: "none", value: {} } },
        { softEdges: { kind: "value", value: { sizePt: Infinity } } },
        Object.defineProperty({}, "fill", getter),
        Object.create({ fill: { kind: "none" } }),
      ]) {
        const drawing = isOwned ? owned() : textBox();
        Object.defineProperty(target(drawing), "shapeStyle", { value: style, enumerable: true });
        expect(() => deserializeWorkbook(rawSnapshot(drawing))).toThrow();
        expect(() => deserializeSheet(rawSnapshot(drawing).sheets[0])).toThrow();
      }
      for (const key of ["kind", "shapeText", "shapeStyle", "text", "rotation"]) {
        const drawing = isOwned ? owned() : textBox();
        Object.defineProperty(target(drawing), key, getter);
        expect(() => deserializeWorkbook(rawSnapshot(drawing))).toThrow();
        expect(() => deserializeSheet(rawSnapshot(drawing).sheets[0])).toThrow();
      }
      for (const model of [
        undefined,
        null,
        {},
        Object.create(shapeText()),
        Object.defineProperty(shapeText(), "layout", getter),
      ]) {
        const drawing = isOwned ? owned() : textBox();
        Object.defineProperty(target(drawing), "shapeText", { value: model, enumerable: true });
        expect(() => deserializeWorkbook(rawSnapshot(drawing))).toThrow();
        expect(() => deserializeSheet(rawSnapshot(drawing).sheets[0])).toThrow();
      }
      const noText = isOwned ? owned() : textBox();
      delete target(noText).shapeText;
      expect(() => deserializeWorkbook(rawSnapshot(noText))).toThrow(/explicit shape text/);
    }
    for (const key of ["kind", "shapeStyle", "shapeText"]) {
      const source = textBox();
      const own = Object.fromEntries(Object.entries(source).filter(([name]) => name !== key));
      const spoof = Object.assign(Object.create(Object.defineProperty({}, key, getter)), own);
      expect(() => deserializeWorkbook(rawSnapshot(spoof))).toThrow();
      expect(() => deserializeSheet(rawSnapshot(spoof).sheets[0])).toThrow();
    }
    expect(reads).toBe(0);
  });

  test("no new body categories leaves old fixtures and their inferred protocols exactly unchanged", () => {
    const plain = { ...legacyShapeDrawing(), kind: "textBox" as const };
    const cases: [SheetDrawing, number][] = [
      [plain, 43],
      [{ ...plain, textDirection: "vertical" }, 55],
      [{ ...plain, shapeText: shapeText() }, 59],
      [{ ...legacyShapeDrawing(), shapeStyle: fullStyle() }, 58],
      [{ ...plain, shapeStyle: { rotation3d: fullStyle().rotation3d } }, 68],
      [{ ...plain, shapeStyle: { format3d: { kind: "none" } } }, 68],
      [
        {
          ...plain,
          shapeStyle: { rotation3d: { kind: "none" }, format3d: { kind: "none" } },
          shapeText: shapeText(),
        },
        68,
      ],
      [
        {
          ...plain,
          shapeText: {
            ...shapeText(),
            characterRuns: [{ start: 0, end: 1, shadow: { kind: "none" } }],
          },
        },
        72,
      ],
      [group(), 61],
    ];
    for (const [drawing, version] of cases) {
      const expected = normalizeSheetDrawing(drawing);
      const workbook = createWorkbook({ id: "old", sheetId: "sheet" }),
        sheet = getActiveSheet(workbook);
      sheet.drawings = [drawing];
      const snapshot = serializeWorkbook(workbook);
      expect(snapshot.version).toBe(version);
      expect(snapshot.sheets[0]!.drawings).toEqual([expected]);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(
        serializeSheet(sheet),
      );
      if (!Object.hasOwn(drawing, "shapeText") && drawing.kind === "textBox")
        expect(snapshot.sheets[0]!.drawings![0]).not.toHaveProperty("shapeText");
    }
    const nested3d = owned({ rotation3d: { kind: "none" } });
    delete target(nested3d).shapeText;
    expect(serializeWorkbook(deserializeWorkbook(rawSnapshot(nested3d, 68))).version).toBe(68);
  });

  test("new body semantics preserve cycle, sharing, depth and node ownership budgets", () => {
    const cyclic = owned();
    cyclic.members.push(cyclic as unknown as ShapeGroupChild);
    const shared = owned();
    shared.members.push(shared.members[0]!);
    const sharedArray = owned();
    sharedArray.members.push({
      ...nested("alias"),
      members: (sharedArray.members[0] as Extract<ShapeGroupChild, { kind: "shapeGroup" }>).members,
    });
    const tooDeep = owned();
    let current = tooDeep.members[0]!;
    for (let depth = 0; depth <= MAX_SHAPE_GROUP_DEPTH; depth++) {
      if (current.kind !== "shapeGroup") throw Error("Expected group");
      const next = nested(`depth-${depth}`);
      current.members = [next];
      current = next;
    }
    if (current.kind !== "shapeGroup") throw Error("Expected group");
    current.members = [target(owned()) as ShapeGroupChild];
    const tooMany = {
      ...owned(),
      members: Array.from({ length: MAX_SHAPE_GROUP_NODES }, (_, index) =>
        leaf(`node-${index}`, "textBox"),
      ),
    };
    for (const drawing of [cyclic, shared, sharedArray, tooDeep, tooMany]) {
      expect(() => deserializeWorkbook(rawSnapshot(drawing))).toThrow(/ownership|budget/);
      expect(() => deserializeSheet(rawSnapshot(drawing).sheets[0])).toThrow(/ownership|budget/);
    }
  });
});
