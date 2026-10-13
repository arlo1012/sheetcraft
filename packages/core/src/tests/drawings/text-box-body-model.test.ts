import { describe, expect, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  normalizeSheetDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
} from "../../sheet-drawings.js";
import {
  collectShapeGroupAssetIds,
  normalizeShapeGroup,
  traverseShapeGroup,
  type ShapeGroupDrawing,
} from "../../shape-group.js";
import { cloneShapeRootsForClipboard } from "../../shape-group-copy.js";
import {
  cloneShapeStyle,
  getShapeStyleAssetIds,
  type ShapeDetailedStyle,
} from "../../shape-style.js";
import { areShapeTextsEqual } from "../../shape-text.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { fullStyle } from "../images/detailed-style-fixture.js";
import { group, leaf, nested } from "../shape-groups/fixtures.js";
import { framedShapeDrawing } from "./shape-frame-fixture.js";
import { shapeText } from "./shape-text-fixture.js";
import { legacyShapeDrawing, textureShapeStyle } from "./shape-style-fixture.js";

const BODY_CATEGORIES = ["fill", "line", "shadow", "reflection", "glow", "softEdges"] as const;
function textBox(shapeStyle: ShapeDetailedStyle = fullStyle()): SheetGraphicDrawing {
  return { ...legacyShapeDrawing(), kind: "textBox", shapeStyle, shapeText: shapeText() };
}
function bodyTree(): ShapeGroupDrawing {
  return {
    ...group("body-root"),
    members: [
      {
        ...nested("body-inner"),
        members: [
          {
            ...leaf("body-text", "textBox"),
            shapeStyle: textureShapeStyle("body-fill", "shared"),
            shapeText: { ...shapeText(), style: textureShapeStyle("shared", "glyph-line") },
          },
        ],
      },
    ],
  };
}
function bodyLeaf(tree: ShapeGroupDrawing) {
  const target = traverseShapeGroup(tree).find(({ node }) => node.kind === "textBox")!.node;
  if (target.kind === "shapeGroup") throw Error("Expected text box");
  return target;
}
function assertDetached(source: unknown, target: unknown) {
  if (!source || typeof source !== "object") return;
  expect(target).not.toBe(source);
  for (const [key, value] of Object.entries(source))
    assertDetached(value, (target as Record<string, unknown>)[key]);
}

describe("explicit TextBox full body model", () => {
  test("every value and explicit None is sparse and lossless for legacy, canonical and owned boxes", () => {
    for (const shapeStyle of [
      fullStyle(),
      textureShapeStyle(),
      ...BODY_CATEGORIES.flatMap((key) => [
        { [key]: fullStyle()[key] },
        { [key]: { kind: "none" as const } },
      ]),
    ]) {
      const input = textBox(shapeStyle);
      const normalized = normalizeSheetDrawing(input) as SheetGraphicDrawing;
      expect(normalized).toEqual(input);
      expect(normalized.kind).toBe("textBox");
      assertDetached(input.shapeStyle, normalized.shapeStyle);
      assertDetached(input.shapeText, normalized.shapeText);
      const canonical = { ...framedShapeDrawing(), kind: "textBox" as const, shapeStyle };
      expect(normalizeSheetDrawing(canonical)).toEqual(canonical);
      const tree = {
        ...group(),
        members: [
          {
            ...nested(),
            members: [{ ...leaf("text", "textBox"), shapeStyle, shapeText: shapeText() }],
          },
        ],
      };
      expect(normalizeShapeGroup(tree)).toEqual(tree);
      expect(normalized).not.toHaveProperty("shapeGeometry");
      expect(normalized).not.toHaveProperty("wordArt");
    }
  });

  test("non-3D choices require validated own text, while empty styles and shape-only features reject", () => {
    for (const category of BODY_CATEGORIES) {
      const drawing = textBox({ [category]: { kind: "none" } });
      const { shapeText: _model, ...plain } = drawing;
      for (const model of [undefined, null, {}, { layout: shapeText().layout }])
        expect(() =>
          normalizeSheetDrawing({ ...plain, shapeText: model } as SheetDrawing),
        ).toThrow();
      expect(() => normalizeSheetDrawing(plain)).toThrow(/explicit shape text/);
      expect(() =>
        normalizeShapeGroup({
          ...group(),
          members: [{ ...leaf("text", "textBox"), shapeStyle: drawing.shapeStyle }],
        }),
      ).toThrow(/explicit shape text/);
    }
    for (const shapeStyle of [{}, undefined])
      expect(() => normalizeSheetDrawing({ ...textBox(), shapeStyle })).toThrow(/empty body/);
    for (const conflicting of [
      { shapeGeometry: { preset: "rect" } },
      { wordArt: true },
      { textDirection: "vertical" },
    ])
      expect(() =>
        normalizeSheetDrawing({ ...textBox(), ...conflicting } as SheetDrawing),
      ).toThrow();
    for (const kind of ["wordArt", "icon", "equation"] as const)
      expect(() => normalizeSheetDrawing({ ...textBox(), kind })).toThrow();
    for (const shapeStyle of [
      { fill: undefined },
      { fill: { kind: "none", value: {} } },
      { line: { kind: "value", value: { widthPt: -1 } } },
      { glow: { kind: "value", value: { sizePt: Infinity } } },
      { softEdges: { kind: "value", value: { sizePt: -1 } } },
    ])
      expect(() => normalizeSheetDrawing(textBox(shapeStyle as ShapeDetailedStyle))).toThrow();
  });

  test("old plain and 3D-only boxes retain their exact model without materializing shapeText", () => {
    const plain = { ...legacyShapeDrawing(), kind: "textBox" as const };
    for (const input of [
      plain,
      { ...plain, textDirection: "vertical" as const },
      ...[
        { rotation3d: fullStyle().rotation3d },
        { format3d: fullStyle().format3d },
        { rotation3d: { kind: "none" as const }, format3d: { kind: "none" as const } },
      ].map((shapeStyle) => ({ ...plain, shapeStyle })),
    ]) {
      expect(normalizeSheetDrawing(input)).toEqual(input);
      expect(normalizeSheetDrawing(input)).not.toHaveProperty("shapeText");
    }
    const nonenumerable = Object.create(null);
    Object.assign(nonenumerable, textBox());
    Object.defineProperty(nonenumerable, "shapeStyle", { value: { fill: { kind: "none" } } });
    Object.defineProperty(nonenumerable, "shapeText", { value: shapeText() });
    expect(normalizeSheetDrawing(nonenumerable)).toEqual(textBox({ fill: { kind: "none" } }));
  });

  test("source, placement, body, text and nested accessors or prototype spoofing never execute getters", () => {
    let reads = 0;
    const getter = {
      get() {
        reads++;
        throw Error("Getter executed");
      },
      enumerable: true,
    };
    for (const key of ["kind", "text", "fontSize", "anchor", "height", "shapeStyle", "shapeText"]) {
      const invalid = Object.defineProperty(textBox(), key, getter);
      expect(() => normalizeSheetDrawing(invalid)).toThrow();
    }
    for (const key of ["row", "column"])
      expect(() =>
        normalizeSheetDrawing({
          ...textBox(),
          anchor: Object.defineProperty({ row: 0, column: 0 }, key, getter),
        }),
      ).toThrow();
    for (const category of BODY_CATEGORIES) {
      const style = Object.defineProperty({}, category, getter);
      expect(() => normalizeSheetDrawing(textBox(style))).toThrow();
      const inherited = Object.create(Object.defineProperty({}, category, getter));
      expect(() => normalizeSheetDrawing(textBox(inherited))).toThrow();
    }
    for (const key of ["shapeStyle", "shapeText", "kind", "text", "anchor"]) {
      const source = textBox();
      const own = Object.fromEntries(Object.entries(source).filter(([name]) => name !== key));
      const inherited = Object.assign(Object.create(Object.defineProperty({}, key, getter)), own);
      expect(() => normalizeSheetDrawing(inherited)).toThrow();
    }
    const tree = bodyTree();
    Object.defineProperty(bodyLeaf(tree), "shapeText", getter);
    expect(() => normalizeShapeGroup(tree)).toThrow();
    expect(reads).toBe(0);
  });

  test("body/glyph assets, deep clones, no-op equality and Undo/Redo retain independent ownership", () => {
    const source = bodyTree(),
      copy = normalizeShapeGroup(source);
    expect(copy).toEqual(source);
    assertDetached(source, copy);
    expect([...collectShapeGroupAssetIds(copy)]).toEqual(["body-fill", "shared", "glyph-line"]);
    expect(getShapeStyleAssetIds(cloneShapeStyle(bodyLeaf(source).shapeStyle))).toEqual([
      "body-fill",
      "shared",
    ]);
    expect(areShapeTextsEqual(bodyLeaf(source).shapeText, bodyLeaf(copy).shapeText)).toBe(true);
    let id = 0;
    const clipboard = cloneShapeRootsForClipboard([source], { createId: () => `copy-${++id}` })[0];
    if (!clipboard || clipboard.kind !== "shapeGroup") throw Error("Expected copied group");
    expect([...collectShapeGroupAssetIds(clipboard)]).toEqual([
      "body-fill",
      "shared",
      "glyph-line",
    ]);
    bodyLeaf(clipboard).shapeStyle!.fill = { kind: "none" };
    expect(bodyLeaf(source).shapeStyle!.fill!.kind).toBe("value");
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [normalizeShapeGroup(source)];
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [copy]))).toBe(
      false,
    );
    const changed = normalizeShapeGroup(source);
    bodyLeaf(changed).shapeStyle!.shadow = { kind: "none" };
    const command = createSetSheetDrawingsCommand(sheet.id, [changed]);
    const expected = structuredClone(changed);
    bodyLeaf(changed).shapeStyle!.fill = { kind: "none" };
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.drawings).toEqual([expected]);
    bodyLeaf(command.drawings[0] as ShapeGroupDrawing).shapeStyle!.line = { kind: "none" };
    expect(sheet.drawings).toEqual([expected]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual([source]);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual([expected]);
  });
});
